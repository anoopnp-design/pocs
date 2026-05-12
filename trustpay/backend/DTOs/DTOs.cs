// ============================================================
//  DTOs.cs  —  Request & Response transfer objects
// ============================================================

using System.ComponentModel.DataAnnotations;

namespace PaymentSystem.DTOs;

// ── Requests ─────────────────────────────────────────────────

public record CreateSubTrusteeRequest(
    [Required, MaxLength(200)] string Name,
    [Required, EmailAddress]   string Email);

public record SetExpectationRequest(
    [Required] int SubTrusteeId,
    [Required, Range(0.01, double.MaxValue)] decimal ExpectedAmount,
    [MaxLength(500)] string? Description,
    [Required] DateTime DueDate);

// ── Responses ────────────────────────────────────────────────

public record SubTrusteeDto(
    int    Id,
    string Name,
    string Email,
    string? RazorpayCustomerId,
    string? RazorpayVAId,
    string? AccountNumber,
    string? IFSC,
    string? BankName,
    DateTime CreatedAt);

public record PaymentExpectationDto(
    int      Id,
    int      SubTrusteeId,
    decimal  ExpectedAmount,
    string?  Description,
    DateTime DueDate,
    string   Status);

public record TransactionDto(
    string   RazorpayPaymentId,
    decimal  Amount,
    string?  UTR,
    string?  PaymentMethod,
    DateTime ReceivedAt);

public record TrusteeStatusRow(
    int      Id,
    string   Name,
    string   Email,
    string?  AccountNumber,
    string?  IFSC,
    decimal  TotalExpected,
    decimal  TotalPaid,
    decimal  Pending,
    DateTime? LastPayment);

public record DashboardDto(
    decimal TotalExpected,
    decimal TotalPaid,
    decimal PendingBalance,
    List<TrusteeStatusRow> SubTrustees);

public record SubTrusteeDetailDto(
    int      Id,
    string   Name,
    string   Email,
    string?  AccountNumber,
    string?  IFSC,
    string?  BankName,
    decimal  TotalExpected,
    decimal  TotalPaid,
    List<TransactionDto> Transactions);
