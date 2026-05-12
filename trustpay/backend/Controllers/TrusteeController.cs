// ============================================================
//  TrusteeController.cs  —  REST API Endpoints
// ============================================================

using Microsoft.AspNetCore.Mvc;
using PaymentSystem.DTOs;
using PaymentSystem.Services;

namespace PaymentSystem.Controllers;

[ApiController]
[Route("api/trustees")]
[Produces("application/json")]
public class TrusteeController(IRazorpayService razorpayService, IBackendAuditService audit) : ControllerBase
{
    // GET /api/trustees/audit
    [HttpGet("audit")]
    [ProducesResponseType(typeof(IEnumerable<dynamic>), 200)]
    public IActionResult GetAuditTrail()
    {
        var events = audit.GetRecentEvents(100);
        return Ok(events);
    }

    // POST /api/trustees
    [HttpPost]
    [ProducesResponseType(typeof(SubTrusteeDto), 201)]
    [ProducesResponseType(typeof(string), 400)]
    [ProducesResponseType(typeof(string), 409)]
    public async Task<IActionResult> CreateSubTrustee(
        [FromBody] CreateSubTrusteeRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var result = await razorpayService.CreateSubTrusteeAsync(request, ct);
        if (!result.IsSuccess)
        {
            int statusCode = result.Error!.Contains("already exists") ? 409 : 502;
            return StatusCode(statusCode, new { error = result.Error });
        }

        return CreatedAtAction(nameof(GetSubTrusteeDetail),
            new { id = result.Data!.Id }, result.Data);
    }

    // GET /api/trustees/{id}
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(SubTrusteeDetailDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetSubTrusteeDetail(int id, CancellationToken ct)
    {
        var result = await razorpayService.GetSubTrusteeDetailAsync(id, ct);
        return result.IsSuccess ? Ok(result.Data) : NotFound(new { error = result.Error });
    }

    // POST /api/trustees/{id}/expectations
    [HttpPost("{id:int}/expectations")]
    [ProducesResponseType(typeof(PaymentExpectationDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> SetExpectation(
        int id, [FromBody] SetExpectationRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        // Ensure route id matches body
        var req = request with { SubTrusteeId = id };
        var result = await razorpayService.SetExpectationAsync(req, ct);
        if (!result.IsSuccess)
        {
            int code = result.Error!.Contains("not found") ? 404 : 400;
            return StatusCode(code, new { error = result.Error });
        }

        return CreatedAtAction(nameof(GetSubTrusteeDetail), new { id }, result.Data);
    }

    // GET /api/trustees/dashboard
    [HttpGet("dashboard")]
    [ProducesResponseType(typeof(DashboardDto), 200)]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var result = await razorpayService.GetDashboardAsync(ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(500, new { error = result.Error });
    }
}
