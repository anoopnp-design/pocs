// ============================================================
//  B2B Payment Collection System — EF Core Entity Models
//  Database: SQL Server | ORM: Entity Framework Core 9
// ============================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PaymentSystem.Models;

// ─────────────────────────────────────────────────────────────
//  SubTrustee  — Represents a B2B customer / paying party
// ─────────────────────────────────────────────────────────────
public class SubTrustee
{
    [Key]
    public int Id { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(320)]
    public string Email { get; set; } = string.Empty;

    /// <summary>Razorpay Customer ID (e.g. "cust_XXXXXXXXXX")</summary>
    [MaxLength(50)]
    public string? RazorpayCustomerId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;

    // ── Navigation ──
    public VirtualAccount? VirtualAccount { get; set; }
    public ICollection<PaymentExpectation> PaymentExpectations { get; set; } = [];
    public ICollection<Transaction> Transactions { get; set; } = [];
}

// ─────────────────────────────────────────────────────────────
//  VirtualAccount  — Razorpay Smart Collect VA per Sub-Trustee
// ─────────────────────────────────────────────────────────────
public class VirtualAccount
{
    [Key]
    public int Id { get; set; }

    /// <summary>Razorpay Virtual Account ID (e.g. "va_XXXXXXXXXX")</summary>
    [Required, MaxLength(50)]
    public string RazorpayVAId { get; set; } = string.Empty;

    /// <summary>NEFT/IMPS/RTGS bank account number issued by Razorpay</summary>
    [Required, MaxLength(30)]
    public string AccountNumber { get; set; } = string.Empty;

    /// <summary>IFSC code of the nodal bank (e.g. "RATN0VAAPIS")</summary>
    [Required, MaxLength(20)]
    public string IFSC { get; set; } = string.Empty;

    /// <summary>Bank name displayed to the payer</summary>
    [MaxLength(100)]
    public string BankName { get; set; } = "RBL Bank / Yes Bank";

    public bool IsActive { get; set; } = true;

    /// <summary>UTC expiry set on the VA; null = no expiry</summary>
    public DateTime? ExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── FK ──
    public int SubTrusteeId { get; set; }
    public SubTrustee SubTrustee { get; set; } = null!;
}

// ─────────────────────────────────────────────────────────────
//  PaymentExpectation  — Amount the Main Trustee expects from a Sub-Trustee
// ─────────────────────────────────────────────────────────────
public class PaymentExpectation
{
    [Key]
    public int Id { get; set; }

    /// <summary>Amount in INR. Stored as decimal(18,2) for precision.</summary>
    [Column(TypeName = "decimal(18,2)")]
    public decimal ExpectedAmount { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public DateTime DueDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ExpectationStatus Status { get; set; } = ExpectationStatus.Pending;

    // ── FK ──
    public int SubTrusteeId { get; set; }
    public SubTrustee SubTrustee { get; set; } = null!;
}

public enum ExpectationStatus
{
    Pending = 0,
    PartiallyPaid = 1,
    Fulfilled = 2,
    Overdue = 3
}

// ─────────────────────────────────────────────────────────────
//  Transaction  — A credited payment received via the VA
// ─────────────────────────────────────────────────────────────
public class Transaction
{
    [Key]
    public int Id { get; set; }

    /// <summary>Razorpay Payment ID — used as idempotency key to prevent duplicates.</summary>
    [Required, MaxLength(50)]
    public string RazorpayPaymentId { get; set; } = string.Empty;

    /// <summary>Amount in INR. Razorpay sends paise; we convert to INR on receipt.</summary>
    [Column(TypeName = "decimal(18,2)")]
    public decimal Amount { get; set; }

    /// <summary>Unique Transaction Reference from the bank (UTR number)</summary>
    [MaxLength(50)]
    public string? UTR { get; set; }

    /// <summary>Payment method: NEFT | RTGS | IMPS | UPI</summary>
    [MaxLength(20)]
    public string? PaymentMethod { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Raw webhook payload stored for audit trail</summary>
    public string? WebhookPayload { get; set; }

    // ── FK ──
    public int SubTrusteeId { get; set; }
    public SubTrustee SubTrustee { get; set; } = null!;
}
