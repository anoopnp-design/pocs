// ============================================================
//  WebhookController.cs  —  Razorpay Webhook Handler
//
//  Security:   HMAC-SHA256 signature verification
//  Idempotency: Unique index on Transaction.RazorpayPaymentId
//               catches any duplicate deliveries gracefully.
// ============================================================

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PaymentSystem.Data;
using PaymentSystem.Models;
using PaymentSystem.Services;

namespace PaymentSystem.Controllers;

[ApiController]
[Route("api/webhook")]
public class WebhookController(
    ApplicationDbContext db,
    IOptions<RazorpayOptions> opts,
    ILogger<WebhookController> logger,
    IBackendAuditService audit) : ControllerBase
{
    private readonly string _webhookSecret = opts.Value.WebhookSecret;

    // ── POST /api/webhook/razorpay ───────────────────────────
    /// <summary>
    /// Razorpay calls this endpoint for every Virtual Account credit event.
    /// Configure this URL in Razorpay Dashboard → Settings → Webhooks.
    /// Subscribe to: virtual_account.credited
    /// </summary>
    [HttpPost("razorpay")]
    [Consumes("application/json")]
    public async Task<IActionResult> HandleRazorpayWebhook(CancellationToken ct)
    {

        Request.EnableBuffering();
        // 2. Do not pass the CancellationToken (ct) to ReadToEndAsync 
        // to prevent partial reads if the request is briefly interrupted.

        string rawBody = string.Empty;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8, 
               detectEncodingFromByteOrderMarks: false, leaveOpen: true))
        {
            rawBody = await reader.ReadToEndAsync();
            // Reset position for other middleware if necessary
            Request.Body.Position = 0;

        }
       

        // ── 2. Verify Razorpay Signature ──────────────────────
        if (!Request.Headers.TryGetValue("X-Razorpay-Signature", out var signatureHeader))
        {
            logger.LogWarning("Webhook rejected: missing X-Razorpay-Signature header.");
            audit.Warning("[Webhook] Rejected: missing signature header");
            return Unauthorized("Missing signature header.");
        }

        string receivedSignature = signatureHeader.ToString();
        if (!IsSignatureValid(rawBody, receivedSignature, _webhookSecret))
        {
            logger.LogWarning("Webhook rejected: invalid signature.");
            audit.Warning("[Webhook] Rejected: invalid signature");
            return Unauthorized("Invalid webhook signature.");
        }

        // ── 3. Parse payload ───────────────────────────────────
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(rawBody);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Webhook payload JSON parse failed.");
            audit.Error("[Webhook] Parse failed: malformed JSON");
            return BadRequest("Malformed JSON payload.");
        }

        var root = doc.RootElement;

        string eventType = root.GetProperty("event").GetString() ?? string.Empty;
        logger.LogInformation("Razorpay webhook received: {Event}", eventType);
        audit.Info($"[Webhook] Received event: {eventType}");

        // ── 4. Handle virtual_account.credited ────────────────
        if (eventType == "virtual_account.credited")
        {
            return await HandleVACreditedAsync(root, rawBody, CancellationToken.None);
        }

        // Acknowledge other events without processing
        audit.Info($"[Webhook] Acknowledged event (not processed): {eventType}");
        return Ok(new { status = "acknowledged", event_type = eventType });
    }

    // ── Event Handler ────────────────────────────────────────
    private async Task<IActionResult> HandleVACreditedAsync(
        JsonElement root, string rawBody, CancellationToken ct)
    {
        try
        {
            // Navigate: payload → virtual_account → entity → id
            var vaEntity   = root.GetProperty("payload")
                                 .GetProperty("virtual_account")
                                 .GetProperty("entity");

            var paymentEnt = root.GetProperty("payload")
                                 .GetProperty("payment")
                                 .GetProperty("entity");

            string rzpVAId      = vaEntity.GetProperty("id").GetString()!;
            string rzpPaymentId = paymentEnt.GetProperty("id").GetString()!;

            // Amount is in paise — convert to INR with proper decimal precision
            long   amountPaise  = paymentEnt.GetProperty("amount").GetInt64();
            decimal amountINR   = amountPaise / 100m;

            string? utr    = GetUtr(paymentEnt);
            string? method = TryGetString(paymentEnt, "method");

            logger.LogInformation(
                "VA credited event: VA={VAId} | Payment={PayId} | Amount=₹{Amount} | UTR={UTR}",
                rzpVAId, rzpPaymentId, amountINR, utr);
            audit.Info($"[Webhook] VA credited: Payment={rzpPaymentId}, Amount=₹{amountINR}, VA={rzpVAId}");

            // ── Resolve Sub-Trustee from VA ──
            var virtualAccount = await db.VirtualAccounts
                .AsNoTracking()
                .FirstOrDefaultAsync(v => v.RazorpayVAId == rzpVAId);

            if (virtualAccount is null)
            {
                logger.LogWarning("Webhook: Virtual Account {VAId} not found in DB. Ignoring.", rzpVAId);
                audit.Warning($"[Webhook] VA not found in DB: {rzpVAId}");
                // Return 200 to prevent Razorpay from retrying an unrecognised VA
                return Ok(new { status = "ignored", reason = "unknown_virtual_account" });
            }

            // ── Idempotency check: skip if payment already logged ──
            bool alreadyLogged = await db.Transactions
                .AnyAsync(t => t.RazorpayPaymentId == rzpPaymentId);

            if (alreadyLogged)
            {
                logger.LogInformation("Duplicate webhook for Payment {PayId} — skipped.", rzpPaymentId);
                audit.Warning($"[Webhook] Duplicate payment (idempotent skip): {rzpPaymentId}");
                return Ok(new { status = "duplicate_skipped" });
            }

            // ── Persist transaction ──
            var transaction = new Transaction
            {
                RazorpayPaymentId = rzpPaymentId,
                Amount            = amountINR,
                UTR               = utr,
                PaymentMethod     = method,
                SubTrusteeId      = virtualAccount.SubTrusteeId,
                WebhookPayload    = rawBody,
                ReceivedAt        = DateTime.UtcNow
            };

            db.Transactions.Add(transaction);
            await db.SaveChangesAsync();

            // ── Optionally update Expectation status ──
            await UpdateExpectationStatusAsync(virtualAccount.SubTrusteeId, CancellationToken.None);

            logger.LogInformation(
                "Transaction logged: Payment={PayId} | Sub-Trustee={STId} | ₹{Amount}",
                rzpPaymentId, virtualAccount.SubTrusteeId, amountINR);
            audit.Success($"[Webhook] Transaction persisted: Payment={rzpPaymentId}, Amount=₹{amountINR}");

            return Ok(new { status = "processed", payment_id = rzpPaymentId });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing virtual_account.credited webhook.");
            audit.Error($"[Webhook] Error processing VA.credited: {ex.Message}");
            // Return 500 → Razorpay will retry (safe because of idempotency check)
            return StatusCode(500, "Internal error processing webhook.");
        }
    }
private string? GetUtr(JsonElement paymentEnt)
{
    try 
    {
        // Path for Smart Collect / Bank Transfers
        if (paymentEnt.TryGetProperty("acquirer_data", out var acquirer) && 
            acquirer.TryGetProperty("bank_transaction_id", out var id))
        {
            return id.GetString();
        }
        
        // Path for UPI/Other methods
        if (paymentEnt.TryGetProperty("utr", out var utr))
        {
            return utr.GetString();
        }
    }
    catch { /* Log parsing error */ }
    
    return "N/A";
}
    // ── Signature Verification ───────────────────────────────
    private bool IsSignatureValid(string payload, string signature, string secret)
    {
        var secretBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);

        using (var hmac = new HMACSHA256(secretBytes))
        {
            var hash = hmac.ComputeHash(payloadBytes);
            var hashString = BitConverter.ToString(hash).Replace("-", "").ToLower();
            
            // Use a constant-time comparison to prevent timing attacks
            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(hashString), 
                Encoding.UTF8.GetBytes(signature)
            );
        }
    }

    // ── Expectation Status Updater ───────────────────────────
    private async Task UpdateExpectationStatusAsync(int subTrusteeId, CancellationToken ct)
    {
        decimal totalPaid = await db.Transactions
            .Where(t => t.SubTrusteeId == subTrusteeId)
            .SumAsync(t => t.Amount,CancellationToken.None);

        var expectations = await db.PaymentExpectations
            .Where(p => p.SubTrusteeId == subTrusteeId && p.Status != ExpectationStatus.Fulfilled)
            .OrderBy(p => p.DueDate)
            .ToListAsync(ct);

        decimal remaining = totalPaid;
        foreach (var exp in expectations)
        {
            if (remaining >= exp.ExpectedAmount)
            {
                exp.Status  = ExpectationStatus.Fulfilled;
                remaining  -= exp.ExpectedAmount;
            }
            else if (remaining > 0)
            {
                exp.Status = ExpectationStatus.PartiallyPaid;
                remaining  = 0;
            }
            else if (exp.DueDate < DateTime.UtcNow)
            {
                exp.Status = ExpectationStatus.Overdue;
            }
        }

        await db.SaveChangesAsync(ct);
    }

    // ── Helpers ──────────────────────────────────────────────
    private static string? TryGetString(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) ? v.GetString() : null;
}
