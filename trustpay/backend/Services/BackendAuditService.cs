// ============================================================
//  BackendAuditService.cs  —  In-memory audit log
// ============================================================

using System;
using System.Collections.Generic;
using System.Linq;

namespace PaymentSystem.Services;

public interface IBackendAuditService
{
    void Log(string message, string category = "info");
    void Info(string message);
    void Success(string message);
    void Warning(string message);
    void Error(string message);
    IEnumerable<AuditEvent> GetRecentEvents(int count = 50);
    void Clear();
}

public class AuditEvent
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Category { get; set; } = "info"; // info, success, warning, error
}

public class BackendAuditService : IBackendAuditService
{
    private static readonly List<AuditEvent> _logs = new();
    private static int _nextId = 1;
    private const int MaxLogs = 200;

    public void Log(string message, string category = "info")
    {
        var evt = new AuditEvent
        {
            Id = _nextId++,
            Timestamp = DateTime.UtcNow,
            Message = message,
            Category = category
        };

        lock (_logs)
        {
            _logs.Insert(0, evt);
            if (_logs.Count > MaxLogs)
            {
                _logs.RemoveAt(_logs.Count - 1);
            }
        }
    }

    public void Info(string message) => Log(message, "info");
    public void Success(string message) => Log(message, "success");
    public void Warning(string message) => Log(message, "warning");
    public void Error(string message) => Log(message, "error");

    public IEnumerable<AuditEvent> GetRecentEvents(int count = 50)
    {
        lock (_logs)
        {
            return _logs.Take(count).ToList();
        }
    }

    public void Clear()
    {
        lock (_logs)
        {
            _logs.Clear();
            _nextId = 1;
        }
    }
}
