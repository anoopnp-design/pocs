import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CreateSubTrusteeRequest,
  DashboardData,
  PaymentService,
  SetExpectationRequest,
  TrusteeStatusRow
} from '../services/payment.service';
import { AuditService } from '../services/audit.service';

interface ToastMessage {
  id: number;
  message: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div *ngIf="toasts().length" class="toast-container">
        <div *ngFor="let toast of toasts()" class="toast-card">{{ toast.message }}</div>
      </div>
      <div class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Main trustee dashboard</p>
            <h2 class="mt-3 text-3xl font-semibold text-slate-950">Payment collection</h2>
          </div>
          <button class="btn-primary" (click)="showAdd.set(true)">Add Sub-Trustee</button>
        </div>

        <div *ngIf="error()" class="mt-6 alert-card">{{ error() }}</div>

        <div *ngIf="loading()" class="mt-6 text-slate-600">Loading dashboard…</div>

        <div *ngIf="dashboard()" class="space-y-6 mt-6">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="metric-card">
              <h3>Total expected</h3>
              <p>{{ dashboard()!.totalExpected | currency:'INR':'symbol':'1.2-2' }}</p>
            </div>
            <div class="metric-card">
              <h3>Total paid</h3>
              <p>{{ dashboard()!.totalPaid | currency:'INR':'symbol':'1.2-2' }}</p>
            </div>
            <div class="metric-card">
              <h3>Pending balance</h3>
              <p>{{ dashboard()!.pendingBalance | currency:'INR':'symbol':'1.2-2' }}</p>
            </div>
          </div>

          <div class="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-soft">
            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm font-semibold text-slate-700">Filter trustees</span>
              <button class="btn-secondary" [ngClass]="{ 'bg-slate-950 text-white': activeTab() === 'all' }" (click)="activeTab.set('all')">All</button>
              <button class="btn-secondary" [ngClass]="{ 'bg-slate-950 text-white': activeTab() === 'overdue' }" (click)="activeTab.set('overdue')">Overdue</button>
              <button class="btn-secondary" [ngClass]="{ 'bg-slate-950 text-white': activeTab() === 'paid' }" (click)="activeTab.set('paid')">Paid</button>
            </div>
          </div>

          <div class="table-card">
            <table class="min-w-full border-separate border-spacing-0">
              <thead class="bg-slate-100 text-slate-500 text-left text-xs uppercase tracking-[0.16em]">
                <tr>
                  <th class="px-6 py-4">Sub-Trustee</th>
                  <th class="px-6 py-4">Expected</th>
                  <th class="px-6 py-4">Paid</th>
                  <th class="px-6 py-4">Pending</th>
                  <th class="px-6 py-4">Status</th>
                  <th class="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody class="bg-white text-sm text-slate-700">
                <tr *ngFor="let trustee of filteredTrustees()" class="cursor-pointer transition hover:bg-slate-50" (click)="openDetail(trustee.id)">
                  <td class="border-b border-slate-200 px-6 py-4">
                    <div class="text-slate-950 font-semibold">{{ trustee.name }}</div>
                    <div class="text-slate-500 text-sm">{{ trustee.email }}</div>
                  </td>
                  <td class="border-b border-slate-200 px-6 py-4">{{ trustee.totalExpected | currency:'INR':'symbol':'1.0-0' }}</td>
                  <td class="border-b border-slate-200 px-6 py-4">{{ trustee.totalPaid | currency:'INR':'symbol':'1.0-0' }}</td>
                  <td class="border-b border-slate-200 px-6 py-4">{{ trustee.pending | currency:'INR':'symbol':'1.0-0' }}</td>
                  <td class="border-b border-slate-200 px-6 py-4">
                    <span class="status-pill" [ngClass]="getStatusClass(trustee)">{{ getStatusLabel(trustee) }}</span>
                  </td>
                  <td class="border-b border-slate-200 px-6 py-4">
                    <button class="text-sky-600 text-sm font-semibold hover:text-sky-800" (click)="$event.stopPropagation(); openExpectation(trustee)">Set expectation</button>
                  </td>
                </tr>
                <tr *ngIf="filteredTrustees().length === 0">
                  <td colspan="6" class="px-6 py-12 text-center text-slate-500">No trustees match this view.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div *ngIf="showAdd()" class="modal-backdrop flex items-center justify-center p-4">
        <div class="modal-panel">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-slate-500">New sub-trustee</p>
              <h3 class="mt-2 text-2xl font-semibold text-slate-950">Add Sub-Trustee</h3>
            </div>
            <button class="text-slate-400 transition hover:text-slate-700" (click)="showAdd.set(false)">✕</button>
          </div>

          <div class="form-section mt-6">
            <label class="label">Full name</label>
            <input class="input-field" [(ngModel)]="newTrustee.name" placeholder="Priya Shah" />
            <label class="label">Email</label>
            <input class="input-field" [(ngModel)]="newTrustee.email" placeholder="priya@example.com" type="email" />
          </div>

          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button class="btn-primary w-full sm:w-auto" (click)="createSubTrustee()" [disabled]="saving()">{{ saving() ? 'Creating…' : 'Create' }}</button>
            <button class="btn-secondary w-full sm:w-auto" (click)="showAdd.set(false)">Cancel</button>
          </div>
        </div>
      </div>

      <div *ngIf="showExp() && selectedTrustee()" class="modal-backdrop flex items-center justify-center p-4">
        <div class="modal-panel">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Set contribution</p>
              <h3 class="mt-2 text-2xl font-semibold text-slate-950">Set expectation for {{ selectedTrustee()!.name }}</h3>
            </div>
            <button class="text-slate-400 transition hover:text-slate-700" (click)="showExp.set(false)">✕</button>
          </div>

          <div class="form-section mt-6">
            <label class="label">Expected amount</label>
            <input class="input-field" type="number" min="1" step="0.01" [(ngModel)]="expectation.expectedAmount" />
            <label class="label">Description</label>
            <input class="input-field" [(ngModel)]="expectation.description" placeholder="Quarterly contribution" />
            <label class="label">Due date</label>
            <input class="input-field" type="date" [(ngModel)]="expectation.dueDate" />
          </div>

          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button class="btn-primary w-full sm:w-auto" (click)="saveExpectation()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save expectation' }}</button>
            <button class="btn-secondary w-full sm:w-auto" (click)="showExp.set(false)">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly svc = inject(PaymentService);
  private readonly auditService = inject(AuditService);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  dashboard = signal<DashboardData | null>(null);
  toasts = signal<ToastMessage[]>([]);
  activeTab = signal<'all' | 'overdue' | 'paid'>('all');
  showAdd = signal(false);
  showExp = signal(false);
  private pollTimer?: number;
  private readonly pollInterval = 10000;
  selectedTrustee = signal<TrusteeStatusRow | null>(null);

  newTrustee: CreateSubTrusteeRequest = { name: '', email: '' };
  expectation: Partial<SetExpectationRequest> = { dueDate: this.defaultDueDate() };

  filteredTrustees = computed(() => {
    const data = this.dashboard();
    if (!data) return [];
    switch (this.activeTab()) {
      case 'overdue':
        return data.subTrustees.filter(t => t.pending > 0);
      case 'paid':
        return data.subTrustees.filter(t => t.pending <= 0 && t.totalExpected > 0);
      default:
        return data.subTrustees;
    }
  });

  ngOnInit() {
    this.auditService.info('[Dashboard] Loading dashboard...');
    this.load();
    this.startPolling();
  }

  ngOnDestroy() {
    this.auditService.info('[Dashboard] Component destroyed, polling stopped.');
    this.stopPolling();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getDashboard().subscribe({
      next: d => {
        const previous = this.dashboard();
        this.dashboard.set(d);
        if (previous && d.totalPaid !== previous.totalPaid) {
          this.auditService.success(`[Dashboard] New payment detected: ₹${(d.totalPaid - previous.totalPaid).toFixed(2)}`);
          this.showToast('New payment received. Dashboard refreshed.');
        } else if (!previous) {
          this.auditService.info(`[Dashboard] Loaded: ${d.subTrustees.length} trustees, ₹${d.totalExpected.toFixed(2)} total expected`);
        }
        this.loading.set(false);
      },
      error: e => {
        this.auditService.error(`[Dashboard] Load failed: ${e.message}`);
        this.error.set(e.message);
        this.loading.set(false);
      }
    });
  }

  private startPolling() {
    this.stopPolling();
    this.auditService.info('[Dashboard] Polling started (10s interval)');
    this.pollTimer = window.setInterval(() => this.refreshDashboard(), this.pollInterval);
  }

  private stopPolling() {
    if (this.pollTimer !== undefined) {
      this.auditService.info('[Dashboard] Polling stopped');
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private refreshDashboard() {
    this.auditService.info('[Dashboard] Polling tick - checking for updates...');
    const previous = this.dashboard();
    this.svc.getDashboard().subscribe({
      next: d => {
        if (previous && d.totalPaid !== previous.totalPaid) {
          this.auditService.success(`[Dashboard] New payment detected: ₹${(d.totalPaid - previous.totalPaid).toFixed(2)}`);
        } else {
          this.auditService.info('[Dashboard] Polling tick - no changes');
        }
        this.dashboard.set(d);
      },
      error: () => {
        this.auditService.warning('[Dashboard] Polling tick - fetch failed (will retry)');
      }
    });
  }

  private showToast(message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    this.toasts.set([...this.toasts(), { id, message }]);
    setTimeout(() => {
      this.toasts.set(this.toasts().filter(toast => toast.id !== id));
    }, 3500);
  }

  createSubTrustee() {
    if (!this.newTrustee.name || !this.newTrustee.email) {
      this.auditService.warning('[Dashboard] Create sub-trustee: Missing name or email');
      this.error.set('Please provide name and email.');
      return;
    }

    this.saving.set(true);
    this.auditService.info(`[Dashboard] Creating sub-trustee: ${this.newTrustee.name} (${this.newTrustee.email})`);
    this.svc.createSubTrustee(this.newTrustee).subscribe({
      next: () => {
        this.auditService.success(`[Dashboard] Sub-trustee created: ${this.newTrustee.name}`);
        this.saving.set(false);
        this.showAdd.set(false);
        this.error.set(null);
        this.newTrustee = { name: '', email: '' };
        this.load();
      },
      error: e => {
        this.auditService.error(`[Dashboard] Create sub-trustee failed: ${e.message}`);
        this.saving.set(false);
        this.error.set(e.message);
      }
    });
  }

  openExpectation(trustee: TrusteeStatusRow) {
    this.selectedTrustee.set(trustee);
    this.expectation = {
      subTrusteeId: trustee.id,
      dueDate: this.defaultDueDate()
    };
    this.showExp.set(true);
  }

  saveExpectation() {
    const req = this.expectation as SetExpectationRequest;
    if (!req.expectedAmount || req.expectedAmount <= 0) {
      this.auditService.warning('[Dashboard] Set expectation: Invalid amount');
      this.error.set('Expected amount must be greater than zero.');
      return;
    }
    this.saving.set(true);
    this.auditService.info(`[Dashboard] Setting expectation for ${this.selectedTrustee()?.name}: ₹${req.expectedAmount}`);
    this.svc.setExpectation(req).subscribe({
      next: () => {
        this.auditService.success(`[Dashboard] Expectation set for ${this.selectedTrustee()?.name}`);
        this.saving.set(false);
        this.showExp.set(false);
        this.error.set(null);
        this.load();
      },
      error: e => {
        this.auditService.error(`[Dashboard] Set expectation failed: ${e.message}`);
        this.saving.set(false);
        this.error.set(e.message);
      }
    });
  }

  openDetail(id: number) {
    this.router.navigate(['sub-trustee', id]);
  }

  getStatusLabel(row: TrusteeStatusRow): string {
    if (row.totalPaid >= row.totalExpected && row.totalExpected > 0) {
      return 'Paid';
    }
    if (row.totalPaid > 0) {
      return 'Partial';
    }
    return 'Pending';
  }

  getStatusClass(row: TrusteeStatusRow): string {
    if (row.totalPaid >= row.totalExpected && row.totalExpected > 0) {
      return 'badge-paid';
    }
    if (row.totalPaid > 0) {
      return 'badge-partial';
    }
    return 'badge-pending';
  }

  private defaultDueDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }
}
