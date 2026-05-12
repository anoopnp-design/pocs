import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditService } from '../../services/audit.service';

@Component({
  selector: 'app-audit-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isOpen()" class="audit-panel">
      <div class="audit-header">
        <h3 class="audit-title">Audit Trail</h3>
        <div class="audit-controls">
          <button class="audit-btn" (click)="clearLogs()" title="Clear logs">Clear</button>
          <button class="audit-btn" (click)="isOpen.set(false)" title="Close">✕</button>
        </div>
      </div>
      <div class="audit-logs">
        <div *ngIf="auditService.logs$() && auditService.logs$().length === 0" class="audit-empty">
          No logs yet.
        </div>
        <div *ngFor="let log of auditService.logs$()" class="audit-log" [ngClass]="'log-' + log.type">
          <span class="log-time">{{ log.timestamp | date:'HH:mm:ss.SSS' }}</span>
          <span class="log-type">[{{ log.type.toUpperCase() }}]</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </div>

    <button *ngIf="!isOpen()" class="audit-toggle" (click)="isOpen.set(true)" title="Open audit trail">
      📋
    </button>
  `,
  styles: [`
    .audit-panel {
      position: fixed;
      bottom: 0;
      right: 0;
      width: 500px;
      height: 300px;
      z-index: 40;
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 8px 8px 0 0;
      display: flex;
      flex-direction: column;
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
    }

    .audit-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #0f172a;
      border-bottom: 1px solid #475569;
      user-select: none;
    }

    .audit-title {
      margin: 0;
      color: #94a3b8;
      font-size: 13px;
      font-weight: 600;
    }

    .audit-controls {
      display: flex;
      gap: 4px;
    }

    .audit-btn {
      background: #334155;
      color: #cbd5e1;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }

    .audit-btn:hover {
      background: #475569;
    }

    .audit-logs {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      background: #1e293b;
    }

    .audit-log {
      margin-bottom: 4px;
      padding: 4px 6px;
      border-radius: 3px;
      color: #cbd5e1;
      display: flex;
      gap: 8px;
      font-size: 11px;
      line-height: 1.4;
    }

    .log-info {
      background: rgba(30, 41, 59, 0.8);
      border-left: 3px solid #64748b;
    }

    .log-success {
      background: rgba(5, 150, 105, 0.1);
      border-left: 3px solid #10b981;
      color: #6ee7b7;
    }

    .log-warning {
      background: rgba(217, 119, 6, 0.1);
      border-left: 3px solid #f59e0b;
      color: #fbbf24;
    }

    .log-error {
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid #ef4444;
      color: #fca5a5;
    }

    .log-time {
      color: #64748b;
      min-width: 100px;
      font-weight: 600;
    }

    .log-type {
      color: #94a3b8;
      min-width: 60px;
      font-weight: 600;
    }

    .log-message {
      flex: 1;
      word-break: break-word;
    }

    .audit-empty {
      color: #64748b;
      text-align: center;
      padding: 40px 20px;
    }

    .audit-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #1e293b;
      border: 2px solid #475569;
      cursor: pointer;
      font-size: 24px;
      transition: all 0.2s;
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .audit-toggle:hover {
      background: #334155;
      border-color: #64748b;
    }

    @media (max-width: 768px) {
      .audit-panel {
        width: 100%;
        height: 250px;
        border-radius: 8px 8px 0 0;
      }
    }
  `]
})
export class AuditPanelComponent {
  auditService = inject(AuditService);
  isOpen = signal(false);

  clearLogs() {
    this.auditService.clear();
  }
}
