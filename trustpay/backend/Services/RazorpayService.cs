// ============================================================
//  RazorpayService.cs  —  Razorpay Smart Collect Integration
//  NuGet: Razorpay (official SDK)
// ============================================================

using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Razorpay.Api;
using PaymentSystem.Data;
using PaymentSystem.Models;
using PaymentSystem.DTOs;

namespace PaymentSystem.Services;

// ── Configuration POCO (bind from appsettings.json) ─────────
public class RazorpayOptions
{
    public string KeyId { get; set; } = string.Empty;
    public string KeySecret { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;
}

// ── Result wrapper for clean error propagation ───────────────
public record ServiceResult<T>(T? Data, string? Error, bool IsSuccess)
{
    public static ServiceResult<T> Ok(T data) => new(data, null, true);
    public static ServiceResult<T> Fail(string error) => new(default, error, false);
}

// ── Interface ────────────────────────────────────────────────
public interface IRazorpayService
{
    Task<ServiceResult<SubTrusteeDto>> CreateSubTrusteeAsync(CreateSubTrusteeRequest request, CancellationToken ct = default);
    Task<ServiceResult<PaymentExpectationDto>> SetExpectationAsync(SetExpectationRequest request, CancellationToken ct = default);
    Task<ServiceResult<DashboardDto>> GetDashboardAsync(CancellationToken ct = default);
    Task<ServiceResult<SubTrusteeDetailDto>> GetSubTrusteeDetailAsync(int subTrusteeId, CancellationToken ct = default);
}

// ── Implementation ───────────────────────────────────────────
public class RazorpayService(
    ApplicationDbContext db,
    IOptions<RazorpayOptions> opts,
    ILogger<RazorpayService> logger) : IRazorpayService
{
    private readonly RazorpayOptions _cfg = opts.Value;

    private RazorpayClient CreateClient() =>
        new(_cfg.KeyId, _cfg.KeySecret);

    // ── 1. Add Sub-Trustee ──────────────────────────────────
    /// <summary>
    /// Creates a Razorpay Customer, then a Virtual Account under that customer.
    /// Saves everything to the local DB in a single transaction.
    /// </summary>
    public async Task<ServiceResult<SubTrusteeDto>> CreateSubTrusteeAsync(
        CreateSubTrusteeRequest request, CancellationToken ct = default)
    {
        // Guard: duplicate email
        bool exists = await db.SubTrustees.AnyAsync(s => s.Email == request.Email, ct);
        if (exists)
            return ServiceResult<SubTrusteeDto>.Fail($"A Sub-Trustee with email '{request.Email}' already exists.");

        string rzpCustomerId;
        string rzpVAId;
        string accountNumber = string.Empty;
        string ifsc = string.Empty;
        string vaStatus = string.Empty;

        try
        {
            var client = CreateClient();

            // ── Step A: Create Razorpay Customer ──
            logger.LogInformation("Creating Razorpay customer for {Email}", request.Email);

            var customerParams = new Dictionary<string, object>
            {
                { "name",  request.Name  },
                { "email", request.Email },
                { "fail_existing", "0" }   // don't fail if email already in Razorpay
            };
            Customer customer = client.Customer.Create(customerParams);
            rzpCustomerId = customer.Attributes["id"].ToString()!;

            logger.LogInformation("Razorpay customer created: {CustomerId}", rzpCustomerId);

            // ── Step B: Create Virtual Account ──
            logger.LogInformation("Creating Virtual Account for customer {CustomerId}", rzpCustomerId);

            // Razorpay expects Unix epoch for close_by (optional — set 1 year out)
            long closeBy = DateTimeOffset.UtcNow.AddYears(1).ToUnixTimeSeconds();

            var vaParams = new Dictionary<string, object>
            {
                { "receivers", new Dictionary<string, object>
                    {
                        { "types", new[] { "bank_account" } }
                    }
                },
                { "name", $"Virtual Account for {request.Name}" },
                { "description", $"Virtual Account for {request.Name}" },   // 0 = accept any amount (Smart Collect)
                { "customer_id", rzpCustomerId },
                { "close_by",    closeBy  }
            };

            Razorpay.Api.VirtualAccount va = client.VirtualAccount.Create(vaParams);
            rzpVAId = va.Attributes["id"]?.ToString() ?? string.Empty;
            vaStatus = va.Attributes["status"]?.ToString() ?? string.Empty;

            // Extract bank details from Razorpay response
            var receivers = va.Attributes["receivers"] as JArray;
            var bankAccount = receivers?.FirstOrDefault() as JObject;
            accountNumber = bankAccount?["account_number"]?.ToString() ?? string.Empty;
            ifsc = bankAccount?["ifsc"]?.ToString() ?? string.Empty;

            logger.LogInformation("Virtual Account created: {VAId} | Status: {Status} | Acc: {Acc} | IFSC: {IFSC}",
                rzpVAId, vaStatus, accountNumber, ifsc);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Razorpay API call failed for {Email}", request.Email);
            return ServiceResult<SubTrusteeDto>.Fail($"Razorpay API error: {ex.Message}");
        }

        // ── Step C: Persist to DB (atomic) ──
        await using var txn = await db.Database.BeginTransactionAsync(ct);
        try
        {
            var subTrustee = new SubTrustee
            {
                Name               = request.Name,
                Email              = request.Email,
                RazorpayCustomerId = rzpCustomerId
            };
            db.SubTrustees.Add(subTrustee);
            await db.SaveChangesAsync(ct);

            var virtualAccount = new PaymentSystem.Models.VirtualAccount
            {
                RazorpayVAId = rzpVAId,
                AccountNumber = accountNumber,
                IFSC = ifsc,
                BankName = "Razorpay Bank", // Razorpay provides the bank details
                IsActive = string.Equals(vaStatus, "active", StringComparison.OrdinalIgnoreCase),
                SubTrusteeId = subTrustee.Id
            };
            db.VirtualAccounts.Add(virtualAccount);
            await db.SaveChangesAsync(ct);

            await txn.CommitAsync(ct);

            logger.LogInformation("Sub-Trustee {Id} persisted to DB.", subTrustee.Id);
            return ServiceResult<SubTrusteeDto>.Ok(MapToDto(subTrustee, virtualAccount));
        }
        catch (Exception ex)
        {
            await txn.RollbackAsync(ct);
            logger.LogError(ex, "DB persist failed for {Email}", request.Email);
            return ServiceResult<SubTrusteeDto>.Fail($"Database error: {ex.Message}");
        }
    }

    // ── 2. Set Payment Expectation ──────────────────────────
    public async Task<ServiceResult<PaymentExpectationDto>> SetExpectationAsync(
        SetExpectationRequest request, CancellationToken ct = default)
    {
        bool trusteeExists = await db.SubTrustees.AnyAsync(s => s.Id == request.SubTrusteeId && s.IsActive, ct);
        if (!trusteeExists)
            return ServiceResult<PaymentExpectationDto>.Fail("Sub-Trustee not found.");

        if (request.ExpectedAmount <= 0)
            return ServiceResult<PaymentExpectationDto>.Fail("Expected amount must be greater than zero.");

        var expectation = new PaymentExpectation
        {
            SubTrusteeId   = request.SubTrusteeId,
            ExpectedAmount = request.ExpectedAmount,
            Description    = request.Description,
            DueDate        = request.DueDate
        };

        db.PaymentExpectations.Add(expectation);
        await db.SaveChangesAsync(ct);

        return ServiceResult<PaymentExpectationDto>.Ok(new PaymentExpectationDto(
            expectation.Id,
            expectation.SubTrusteeId,
            expectation.ExpectedAmount,
            expectation.Description,
            expectation.DueDate,
            expectation.Status.ToString()));
    }

    // ── 3. Dashboard ────────────────────────────────────────
    public async Task<ServiceResult<DashboardDto>> GetDashboardAsync(CancellationToken ct = default)
    {
        var trustees = await db.SubTrustees
            .Where(s => s.IsActive)
            .Include(s => s.VirtualAccount)
            .Include(s => s.PaymentExpectations)
            .Include(s => s.Transactions)
            .AsNoTracking()
            .ToListAsync(ct);

        var rows = trustees.Select(s => new TrusteeStatusRow(
            s.Id,
            s.Name,
            s.Email,
            s.VirtualAccount?.AccountNumber,
            s.VirtualAccount?.IFSC,
            TotalExpected:  s.PaymentExpectations.Sum(p => p.ExpectedAmount),
            TotalPaid:      s.Transactions.Sum(t => t.Amount),
            Pending:        s.PaymentExpectations.Sum(p => p.ExpectedAmount) - s.Transactions.Sum(t => t.Amount),
            LastPayment:    s.Transactions.OrderByDescending(t => t.ReceivedAt).FirstOrDefault()?.ReceivedAt
        )).ToList();

        var summary = new DashboardDto(
            TotalExpected:   rows.Sum(r => r.TotalExpected),
            TotalPaid:       rows.Sum(r => r.TotalPaid),
            PendingBalance:  rows.Sum(r => r.Pending),
            SubTrustees:     rows);

        return ServiceResult<DashboardDto>.Ok(summary);
    }

    // ── 4. Sub-Trustee Detail View ──────────────────────────
    public async Task<ServiceResult<SubTrusteeDetailDto>> GetSubTrusteeDetailAsync(
        int subTrusteeId, CancellationToken ct = default)
    {
        var s = await db.SubTrustees
            .Include(x => x.VirtualAccount)
            .Include(x => x.PaymentExpectations)
            .Include(x => x.Transactions)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == subTrusteeId, ct);

        if (s is null)
            return ServiceResult<SubTrusteeDetailDto>.Fail("Sub-Trustee not found.");

        var detail = new SubTrusteeDetailDto(
            s.Id, s.Name, s.Email,
            s.VirtualAccount?.AccountNumber,
            s.VirtualAccount?.IFSC,
            s.VirtualAccount?.BankName,
            TotalExpected: s.PaymentExpectations.Sum(p => p.ExpectedAmount),
            TotalPaid:     s.Transactions.Sum(t => t.Amount),
            Transactions:  s.Transactions
                            .OrderByDescending(t => t.ReceivedAt)
                            .Select(t => new TransactionDto(
                                t.RazorpayPaymentId, t.Amount, t.UTR, t.PaymentMethod, t.ReceivedAt))
                            .ToList());

        return ServiceResult<SubTrusteeDetailDto>.Ok(detail);
    }

    // ── Mapper ──────────────────────────────────────────────
    private static SubTrusteeDto MapToDto(SubTrustee s, PaymentSystem.Models.VirtualAccount va) =>
        new(s.Id, s.Name, s.Email, s.RazorpayCustomerId,
            va.RazorpayVAId, va.AccountNumber, va.IFSC, va.BankName, s.CreatedAt);
}
