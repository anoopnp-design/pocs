// ============================================================
//  RazorpayTransactionSyncWorker.cs  —  Background sync worker
// ============================================================

using System.Linq;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Razorpay.Api;
using PaymentSystem.Data;
using PaymentSystem.Models;

namespace PaymentSystem.Services;

public class RazorpayTransactionSyncWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly RazorpayOptions _cfg;
    private readonly ILogger<RazorpayTransactionSyncWorker> _logger;
    private readonly IBackendAuditService _audit;
    private static readonly TimeSpan SyncInterval = TimeSpan.FromMinutes(5);

    public RazorpayTransactionSyncWorker(
        IServiceScopeFactory scopeFactory,
        IOptions<RazorpayOptions> opts,
        ILogger<RazorpayTransactionSyncWorker> logger,
        IBackendAuditService audit)
    {
        _scopeFactory = scopeFactory;
        _cfg = opts.Value;
        _logger = logger;
        _audit = audit;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Razorpay sync worker starting. Poll interval: {Interval}.", SyncInterval);
        _audit.Info("[Sync] Razorpay transaction sync worker started (5min interval)");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error while syncing Razorpay transactions.");
                _audit.Error($"[Sync] Error: {ex.Message}");
            }

            try
            {
                await Task.Delay(SyncInterval, stoppingToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("Razorpay sync worker stopping.");
        _audit.Info("[Sync] Razorpay transaction sync worker stopped");
    }

    private RazorpayClient CreateClient() => new RazorpayClient(_cfg.KeyId, _cfg.KeySecret);

    private async Task SyncOnceAsync(CancellationToken ct)
    {
        _audit.Info("[Sync] Starting Razorpay VA and transaction sync...");
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var client = CreateClient();

        // Fetch all virtual accounts from Razorpay
        var razorpayVas = client.VirtualAccount.All();
        if (razorpayVas == null || razorpayVas.Count == 0)
        {
            _logger.LogInformation("No virtual accounts found in Razorpay.");
            _audit.Info("[Sync] No virtual accounts found in Razorpay");
            return;
        }

        _logger.LogInformation("Fetched {Count} virtual accounts from Razorpay.", razorpayVas.Count);
        _audit.Info($"[Sync] Fetched {razorpayVas.Count} virtual accounts from Razorpay");

        // Ensure all Razorpay VAs have local records, and keep VA status in sync
        foreach (var rva in razorpayVas)
        {
            if (ct.IsCancellationRequested) break;

            string vaId = rva.Attributes["id"]?.ToString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(vaId)) continue;

            string rzpStatus = rva.Attributes["status"]?.ToString() ?? string.Empty;
            bool isActive = string.Equals(rzpStatus, "active", StringComparison.OrdinalIgnoreCase);

            var localVa = await db.VirtualAccounts.FirstOrDefaultAsync(v => v.RazorpayVAId == vaId, ct);
            if (localVa != null)
            {
                bool updated = false;
                if (localVa.IsActive != isActive)
                {
                    localVa.IsActive = isActive;
                    updated = true;
                }

                var currentReceivers = rva.Attributes["receivers"] as JArray;
                string currentAccountNumber = currentReceivers?[0]?["account_number"]?.ToString() ?? string.Empty;
                string currentIfsc = currentReceivers?[0]?["ifsc"]?.ToString() ?? string.Empty;
                string currentBankName = rva.Attributes["bank_name"]?.ToString() ?? localVa.BankName;

                if (!string.IsNullOrWhiteSpace(currentAccountNumber) && localVa.AccountNumber != currentAccountNumber)
                {
                    localVa.AccountNumber = currentAccountNumber;
                    updated = true;
                }
                if (!string.IsNullOrWhiteSpace(currentIfsc) && localVa.IFSC != currentIfsc)
                {
                    localVa.IFSC = currentIfsc;
                    updated = true;
                }
                if (!string.IsNullOrWhiteSpace(currentBankName) && localVa.BankName != currentBankName)
                {
                    localVa.BankName = currentBankName;
                    updated = true;
                }

                if (updated)
                {
                    await db.SaveChangesAsync(ct);
                    _logger.LogInformation("Updated local VA {VAId} status to {Status}.", vaId, rzpStatus);
                }

                continue;
            }

            // Create local records
            string customerId = rva.Attributes["customer_id"]?.ToString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(customerId)) continue;

            var customer = client.Customer.Fetch(customerId);
            string email = customer.Attributes["email"]?.ToString() ?? string.Empty;
            string name = customer.Attributes["name"]?.ToString() ?? rva.Attributes["name"]?.ToString() ?? "Unknown";

            var existingSub = await db.SubTrustees
                .Include(s => s.VirtualAccount)
                .FirstOrDefaultAsync(s => s.Email == email, ct);
            if (existingSub == null)
            {
                existingSub = new PaymentSystem.Models.SubTrustee { Name = name, Email = email };
                db.SubTrustees.Add(existingSub);
                await db.SaveChangesAsync(ct);
            }
            else if (existingSub.VirtualAccount != null)
            {
                _logger.LogWarning("Skipping VA {VAId} because SubTrustee {Email} already has a VA.", vaId, email);
                continue;
            }

            var receivers = rva.Attributes["receivers"] as JArray;
            string accountNumber = receivers?[0]?["account_number"]?.ToString() ?? string.Empty;
            string ifsc = receivers?[0]?["ifsc"]?.ToString() ?? string.Empty;
            string bankName = rva.Attributes["bank_name"]?.ToString() ?? string.Empty;

            localVa = new PaymentSystem.Models.VirtualAccount
            {
                RazorpayVAId = vaId,
                AccountNumber = accountNumber,
                IFSC = ifsc,
                BankName = bankName,
                IsActive = isActive,
                SubTrusteeId = existingSub.Id
            };
            db.VirtualAccounts.Add(localVa);
            await db.SaveChangesAsync(ct);

            _logger.LogInformation("Created local records for VA {VAId}, SubTrustee {Email}.", vaId, email);
        }

        // Now sync transactions for all active local virtual accounts
        var virtualAccounts = await db.VirtualAccounts
            .Where(v => v.IsActive && !string.IsNullOrWhiteSpace(v.RazorpayVAId))
            .ToListAsync(ct);

        _logger.LogInformation("Syncing transactions for {Count} active virtual accounts.", virtualAccounts.Count);

        if (virtualAccounts.Count == 0)
        {
            _audit.Info("[Sync] No active virtual accounts to sync");
            return;
        }

        var existingPayments = await db.Transactions
            .Select(t => t.RazorpayPaymentId)
            .ToListAsync(ct);

        var existingPaymentIds = existingPayments.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var totalInserted = 0;

        foreach (var va in virtualAccounts)
        {
            if (ct.IsCancellationRequested) break;
            totalInserted += await SyncVirtualAccountAsync(db, client, va, existingPaymentIds, ct);
        }

        if (totalInserted > 0)
        {
            _logger.LogInformation("Razorpay sync worker inserted {Count} missing transactions.", totalInserted);
            _audit.Success($"[Sync] Successfully synced {totalInserted} new transactions");
        }
        else
        {
            _audit.Info("[Sync] Sync completed - no new transactions found");
        }
    }

    private async Task<int> SyncVirtualAccountAsync(
        ApplicationDbContext db,
        RazorpayClient client,
        PaymentSystem.Models.VirtualAccount virtualAccount,
        HashSet<string> existingPaymentIds,
        CancellationToken ct)
    {
        int inserted = 0;
        int skip = 0;
        const int pageSize = 100;

        _logger.LogInformation("Syncing Razorpay payments for VA {VAId}.", virtualAccount.RazorpayVAId);

        while (!ct.IsCancellationRequested)
        {
            var paymentParams = new Dictionary<string, object>
            {
                { "virtual_account_id", virtualAccount.RazorpayVAId },
                { "count", pageSize },
                { "skip", skip }
            };

            var payments = client.Payment.All(paymentParams);
            if (payments is null || payments.Count == 0)
            {
                break;
            }

            foreach (var payment in payments)
            {
                if (ct.IsCancellationRequested) break;

                string paymentId = payment.Attributes["id"]?.ToString() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(paymentId) || existingPaymentIds.Contains(paymentId))
                {
                    continue;
                }

                long amountPaise = 0;
                object amountObj = null;
                long amountValue = 0;
                if (payment["amount"] is object && long.TryParse(payment["amount"] ?.ToString(), out amountValue))
                {
                    amountPaise = amountValue;
                }

                decimal amountINR = amountPaise / 100m;
                string? method = null;
                object methodObj = null;
                if (payment["method"] is object)
                {
                    method = payment["method"]?.ToString();
                }
                string? utr = GetUtr(payment);
                DateTime receivedAt = GetPaymentDate(payment);

                var transaction = new Transaction
                {
                    RazorpayPaymentId = paymentId,
                    Amount = amountINR,
                    UTR = utr,
                    PaymentMethod = method,
                    SubTrusteeId = virtualAccount.SubTrusteeId,
                    WebhookPayload = JObject.FromObject(payment.Attributes).ToString(),
                    ReceivedAt = receivedAt
                };

                db.Transactions.Add(transaction);
                existingPaymentIds.Add(paymentId);
                inserted++;
            }

            if (inserted > 0)
            {
                await db.SaveChangesAsync(ct);
                await UpdateExpectationStatusAsync(db, virtualAccount.SubTrusteeId, ct);
            }

            if (payments.Count < pageSize)
            {
                break;
            }

            skip += pageSize;
        }

        return inserted;
    }

    // Helper to safely extract long values from SDK dynamic object
private long TryGetLong(Payment payment, string key)
{
    // Check if the key exists and try to parse it
    if (payment[key] is object val && long.TryParse(val.ToString(), out long result))
    {
        return result;
    }
    
    // Ensure 0 is returned if the key is missing or parsing fails
    return 0; 
}
    private static string? GetUtr(Razorpay.Api.Payment payment)
    {
   
        if (payment["acquirer_data"] is object acqData)
        {
            var acquirer = acqData as JObject;
            if (acquirer != null)
            {
                string? bankTransactionId = acquirer.Value<string>("bank_transaction_id");
                if (!string.IsNullOrWhiteSpace(bankTransactionId))
                {
                    return bankTransactionId;
                }
            }
        }

        if (payment["utr"] is object utrObj)
        {
            return utrObj?.ToString();
        }

        return null;
    }

    private static DateTime GetPaymentDate(Razorpay.Api.Payment payment)
    {
        if (payment["created_at"] is object createdAtObj)
        {
            if (createdAtObj is long epochSeconds && epochSeconds > 0)
            {
                return DateTimeOffset.FromUnixTimeSeconds(epochSeconds).UtcDateTime;
            }

            if (createdAtObj is string createdAtString && DateTime.TryParse(createdAtString, out var parsed))
            {
                return parsed.ToUniversalTime();
            }

            if (long.TryParse(createdAtObj?.ToString(), out var parsedEpoch) && parsedEpoch > 0)
            {
                return DateTimeOffset.FromUnixTimeSeconds(parsedEpoch).UtcDateTime;
            }
        }

        return DateTime.UtcNow;
    }

    private static async Task UpdateExpectationStatusAsync(ApplicationDbContext db, int subTrusteeId, CancellationToken ct)
    {
        decimal totalPaid = await db.Transactions
            .Where(t => t.SubTrusteeId == subTrusteeId)
            .SumAsync(t => t.Amount, ct);

        var expectations = await db.PaymentExpectations
            .Where(p => p.SubTrusteeId == subTrusteeId && p.Status != ExpectationStatus.Fulfilled)
            .OrderBy(p => p.DueDate)
            .ToListAsync(ct);

        decimal remaining = totalPaid;
        foreach (var exp in expectations)
        {
            if (remaining >= exp.ExpectedAmount)
            {
                exp.Status = ExpectationStatus.Fulfilled;
                remaining -= exp.ExpectedAmount;
            }
            else if (remaining > 0)
            {
                exp.Status = ExpectationStatus.PartiallyPaid;
                remaining = 0;
            }
            else if (exp.DueDate < DateTime.UtcNow)
            {
                exp.Status = ExpectationStatus.Overdue;
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
