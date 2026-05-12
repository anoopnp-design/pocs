// ============================================================
//  ApplicationDbContext.cs  —  EF Core 9 / SQLite
// ============================================================

using Microsoft.EntityFrameworkCore;
using PaymentSystem.Models;

namespace PaymentSystem.Data;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options)
{
    public DbSet<SubTrustee> SubTrustees => Set<SubTrustee>();
    public DbSet<VirtualAccount> VirtualAccounts => Set<VirtualAccount>();
    public DbSet<PaymentExpectation> PaymentExpectations => Set<PaymentExpectation>();
    public DbSet<Transaction> Transactions => Set<Transaction>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        // ── SubTrustee ──────────────────────────────────────────
        mb.Entity<SubTrustee>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.RazorpayCustomerId).IsUnique();
        });

        // ── VirtualAccount ──────────────────────────────────────
        mb.Entity<VirtualAccount>(e =>
        {
            e.HasIndex(x => x.RazorpayVAId).IsUnique();
            e.HasIndex(x => x.AccountNumber).IsUnique();
            e.HasIndex(x => x.SubTrusteeId).IsUnique();

            e.HasOne(v => v.SubTrustee)
             .WithOne(s => s.VirtualAccount)
             .HasForeignKey<VirtualAccount>(v => v.SubTrusteeId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // ── PaymentExpectation ──────────────────────────────────
        mb.Entity<PaymentExpectation>(e =>
        {
            e.HasOne(p => p.SubTrustee)
             .WithMany(s => s.PaymentExpectations)
             .HasForeignKey(p => p.SubTrusteeId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Transaction ─────────────────────────────────────────
        mb.Entity<Transaction>(e =>
        {
            // Idempotency: one row per Razorpay Payment ID
            e.HasIndex(x => x.RazorpayPaymentId).IsUnique();

            e.HasOne(t => t.SubTrustee)
             .WithMany(s => s.Transactions)
             .HasForeignKey(t => t.SubTrusteeId)
             .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
