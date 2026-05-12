import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PaymentService, SubTrusteeDetail } from '../services/payment.service';
import { AuditService } from '../services/audit.service';

interface ToastMessage {
  id: number;
  message: string;
}

@Component({
  selector: 'app-sub-trustee-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="space-y-6">
      <div *ngIf="toasts().length" class="toast-container">
        <div *ngFor="let toast of toasts()" class="toast-card">{{ toast.message }}</div>
      </div>
      <div class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Sub-Trustee detail</p>
            <h2 class="mt-2 text-3xl font-semibold text-slate-950">Payment information</h2>
          </div>
          <a routerLink="/" class="btn-secondary">Back to dashboard</a>
        </div>

        <div *ngIf="error()" class="mt-6 alert-card">{{ error() }}</div>
        <div *ngIf="loading()" class="mt-6 text-slate-600">Loading details…</div>
      </div>

      <div *ngIf="detail()" class="grid gap-6">
        <div class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <h3 class="text-xl font-semibold text-slate-950">{{ detail()!.name }}</h3>
          <p class="mt-2 text-sm text-slate-500">{{ detail()!.email }}</p>
        </div>

        <div class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-950">Virtual account</h3>
              <div class="mt-3 space-y-2 text-sm text-slate-700">
                <p><span class="font-semibold">Account number:</span> {{ detail()!.accountNumber || 'Not assigned' }}</p>
                <p><span class="font-semibold">IFSC:</span> {{ detail()!.ifsc || 'Not assigned' }}</p>
                <p><span class="font-semibold">Bank:</span> {{ detail()!.bankName || 'Not assigned' }}</p>
              </div>
            </div>
            <div class="flex flex-col gap-3 sm:items-end">
              <button *ngIf="detail()!.accountNumber" class="btn-primary" (click)="copyDetails(detail()!)">Copy details</button>
              <p *ngIf="copied()" class="text-sm text-slate-500">Account details copied to clipboard.</p>
            </div>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="metric-card">
            <h3>Total due</h3>
            <p>{{ detail()!.totalExpected | currency:'INR':'symbol':'1.2-2' }}</p>
          </div>
          <div class="metric-card">
            <h3>Total paid</h3>
            <p>{{ detail()!.totalPaid | currency:'INR':'symbol':'1.2-2' }}</p>
          </div>
        </div>

        <div class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
          <h3 class="text-lg font-semibold text-slate-950">Transaction history</h3>
          <p *ngIf="detail()!.transactions.length === 0" class="mt-3 text-sm text-slate-500">No transactions yet.</p>
          <ul *ngIf="detail()!.transactions.length > 0" class="mt-4 space-y-4">
            <li *ngFor="let txn of detail()!.transactions" class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div class="flex items-center justify-between gap-4">
                <p class="text-slate-950 font-semibold">{{ txn.amount | currency:'INR':'symbol':'1.2-2' }}</p>
                <p class="text-xs uppercase tracking-[0.2em] text-slate-500">{{ txn.receivedAt | date:'mediumDate' }}</p>
              </div>
              <p class="mt-2 text-sm text-slate-600">{{ txn.paymentMethod || 'NEFT' }} · {{ txn.utr || 'No UTR' }}</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  `
})
export class SubTrusteeViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(PaymentService);
  private readonly auditService = inject(AuditService);

  loading = signal(true);
  error = signal<string | null>(null);
  detail = signal<SubTrusteeDetail | null>(null);
  copied = signal(false);
  toasts = signal<ToastMessage[]>([]);
  private pollTimer?: number;
  private readonly pollInterval = 10000;

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.auditService.error(`[SubTrusteeView] Invalid sub-trustee ID: ${id}`);
      this.error.set('Invalid sub-trustee id.');
      this.loading.set(false);
      return;
    }

    this.auditService.info(`[SubTrusteeView] Loading details for sub-trustee ${id}`);
    this.loadDetail(id);
    this.startPolling(id);
  }

  ngOnDestroy() {
    this.auditService.info('[SubTrusteeView] Component destroyed, polling stopped.');
    this.stopPolling();
  }

  copyDetails(detail: SubTrusteeDetail) {
    const text = `Account Number: ${detail.accountNumber}\nIFSC: ${detail.ifsc}\nBank: ${detail.bankName}`;
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  private loadDetail(id: number) {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSubTrusteeDetail(id).subscribe({
      next: d => {
        this.auditService.info(`[SubTrusteeView] Loaded ${d.name}: ${d.transactions.length} transactions, ₹${d.totalPaid.toFixed(2)} paid`);
        this.detail.set(d);
        this.loading.set(false);
      },
      error: e => {
        this.auditService.error(`[SubTrusteeView] Load failed: ${e.message}`);
        this.error.set(e.message);
        this.loading.set(false);
      }
    });
  }

  private startPolling(id: number) {
    this.stopPolling();
    this.auditService.info(`[SubTrusteeView] Polling started for sub-trustee ${id} (10s interval)`);
    this.pollTimer = window.setInterval(() => this.refreshDetail(id), this.pollInterval);
  }

  private stopPolling() {
    if (this.pollTimer !== undefined) {
      this.auditService.info('[SubTrusteeView] Polling stopped');
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private refreshDetail(id: number) {
    this.auditService.info(`[SubTrusteeView] Polling tick - checking for updates...`);
    const previous = this.detail();
    this.svc.getSubTrusteeDetail(id).subscribe({
      next: d => {
        if (previous && d.totalPaid !== previous.totalPaid) {
          const newPayment = d.totalPaid - previous.totalPaid;
          this.auditService.success(`[SubTrusteeView] New payment for ${d.name}: ₹${newPayment.toFixed(2)}`);
          this.showToast('New payment received. Details refreshed.');
        } else {
          this.auditService.info('[SubTrusteeView] Polling tick - no changes');
        }
        this.detail.set(d);
      },
      error: () => {
        this.auditService.warning('[SubTrusteeView] Polling tick - fetch failed (will retry)');
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
}
