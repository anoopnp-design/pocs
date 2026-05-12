// ============================================================
//  Program.cs  —  .NET 9 Minimal API bootstrap
// ============================================================

using Microsoft.EntityFrameworkCore;
using PaymentSystem.Data;
using PaymentSystem.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Services ─────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "B2B Payment Collection API", Version = "v1" });
});

// EF Core — SQLite
builder.Services.AddDbContext<ApplicationDbContext>(opt =>
opt.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection"))    );

// Razorpay configuration
builder.Services.Configure<RazorpayOptions>(
    builder.Configuration.GetSection("Razorpay"));

// Application services
builder.Services.AddScoped<IRazorpayService, RazorpayService>();
builder.Services.AddSingleton<IBackendAuditService, BackendAuditService>();
builder.Services.AddHostedService<RazorpayTransactionSyncWorker>();

// CORS for Angular dev server
builder.Services.AddCors(opt => opt.AddPolicy("Angular", policy =>
    policy.WithOrigins("http://localhost:4200")
          .AllowAnyHeader()
          .AllowAnyMethod()));

var app = builder.Build();
var useHttpsRedirection = builder.Configuration.GetValue<bool?>("UseHttpsRedirection") ?? true;

// ── Middleware ───────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Angular");
if (useHttpsRedirection)
{
    app.UseHttpsRedirection();
}
app.UseAuthorization();
app.MapControllers();

// ── Auto-create database/schema on startup
using var scope = app.Services.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
await db.Database.EnsureCreatedAsync();

app.Run();
