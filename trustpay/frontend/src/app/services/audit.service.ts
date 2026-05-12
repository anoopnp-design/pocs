import { Injectable, signal } from '@angular/core';

export interface AuditLog {
  id: number;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private logs = signal<AuditLog[]>([]);
  private nextId = signal(1);
  readonly maxLogs = 100;

  logs$ = this.logs.asReadonly();

  log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const auditLog: AuditLog = {
      id: this.nextId(),
      timestamp: new Date(),
      message,
      type
    };
    this.nextId.set(this.nextId() + 1);

    const currentLogs = this.logs();
    const updated = [auditLog, ...currentLogs].slice(0, this.maxLogs);
    this.logs.set(updated);
  }

  info(message: string) {
    this.log(message, 'info');
  }

  success(message: string) {
    this.log(message, 'success');
  }

  warning(message: string) {
    this.log(message, 'warning');
  }

  error(message: string) {
    this.log(message, 'error');
  }

  clear() {
    this.logs.set([]);
    this.nextId.set(1);
  }

  getLogs(): AuditLog[] {
    return this.logs();
  }
}
