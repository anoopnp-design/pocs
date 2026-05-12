// ============================================================
//  sub-trustee-view.component.ts  —  Angular 21
//  The "Payment Details" card shown to a logged-in Sub-Trustee
// ============================================================

import { Component, OnInit, inject, signal, input } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { PaymentService, SubTrusteeDetail, Transaction } from '../../services/payment.service';

@Component({
  selector: 'app-sub-trustee-view',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  template: `
    <div class="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12">
      <div class="w-full max-w-lg">

        <!-- ── Loading ── -->
        @if (loading()) {
          <div class="flex justify-center py-24">
            <div class="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }

        <!-- ── Error ── -->
        @if (error()) {
          <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {{ error() }}
          </div>
        }

        <!-- ── Content ── -->
        @if (detail(); as d) {

          <!-- Identity Header -->
          <div class="mb-6">
            <div class="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center
                        text-emerald-700 font-semibold text-lg mb-3">
              {{ initials(d.name) }}
            </div>
            <h1 class="text-xl font-semibold text-gray-900">{{ d.name }}</h1>
            <p class="text-sm text-gray-400">{{ d.email }}</p>
          </div>

          <!-- ── Virtual Account Card ── -->
          <div class="rounded-2xl p-6 mb-4 text-white"
               style="background: linear-gradient(135deg, #059669 0%, #065f46 100%)">
            <p class="text-xs uppercase tracking-widest text-emerald-200 mb-4">
              Your Virtual Account
            </p>

            <div class="mb-5">
              <p class="text-xs text-emerald-300 mb-1">Account Number</p>
              <p class="text-2xl font-mono font-medium tracking-widest">
                {{ d.accountNumber || '— Not assigned —' }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-emerald-300 mb-1">IFSC Code</p>
                <p class="font-mono font-medium">{{ d.ifsc || '—' }}</p>
              </div>
              <div>
                <p class="text-xs text-emerald-300 mb-1">Bank</p>
                <p class="font-medium">{{ d.bankName || '—' }}</p>
              </div>
            </div>

            <!-- Copy button -->
            @if (d.accountNumber) {
              <button
                (click)="copyDetails(d)"
                class="mt-5 w-full flex items-center justify-center gap-2
                       border border-emerald-500 rounded-lg py-2 text-sm
                       text-emerald-100 hover:bg-emerald-700 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                {{ copied() ? 'Copied!' : 'Copy account details' }}
              </button>
            }
          </div>

          <!-- ── How to Pay instructions ── -->
          <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
            <p class="text-xs font-medium text-blue-700 uppercase tracking-wide mb-2">How to pay</p>
            <ol class="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Open your bank's Net Banking or UPI app</li>
              <li>Add the above account as a beneficiary (NEFT/RTGS)</li>
              <li>Transfer your exact due amount</li>
              <li>Payment is confirmed automatically within minutes</li>
            </ol>
          </div>

          <!-- ── Summary Metrics ── -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Due</p>
              <p class="text-lg font-semibold text-gray-900">
                {{ d.totalExpected | currency:'INR':'symbol':'1.2-2' }}
              </p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
              <p class="text-lg font-semibold text-emerald-600">
                {{ d.totalPaid | currency:'INR':'symbol':'1.2-2' }}
              </p>
            </div>
          </div>

          <!-- Balance -->
          @if (d.totalExpected - d.totalPaid > 0) {
            <div class="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4
                        flex items-center justify-between">
              <span class="text-sm text-amber-700">Outstanding balance</span>
              <span class="font-semibold text-amber-700">
                {{ (d.totalExpected - d.totalPaid) | currency:'INR':'symbol':'1.2-2' }}
              </span>
            </div>
          } @else if (d.totalExpected > 0) {
            <div class="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4
                        flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-600" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span class="text-sm font-medium text-emerald-700">All payments received — thank you!</span>
            </div>
          }

          <!-- ── Transaction History ── -->
          <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-50">
              <h2 class="text-sm font-medium text-gray-700">Transaction history</h2>
            </div>

            @if (d.transactions.length === 0) {
              <div class="py-10 text-center text-gray-400 text-sm">
                No transactions yet. Make your first payment above.
              </div>
            } @else {
              @for (txn of d.transactions; track txn.razorpayPaymentId) {
                <div class="flex items-center justify-between px-4 py-3
                            border-b border-gray-50 last:border-b-0">
                  <div>
                    <p class="text-sm font-medium text-gray-900">
                      {{ txn.amount | currency:'INR':'symbol':'1.2-2' }}
                    </p>
                    <p class="text-xs text-gray-400">
                      {{ txn.paymentMethod || 'NEFT' }}
                      @if (txn.utr) { · UTR: {{ txn.utr }} }
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-gray-400">{{ txn.receivedAt | date:'dd MMM y' }}</p>
                    <span class="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Received</span>
                  </div>
                </div>
              }
            }
          </div>

        }
      </div>
    </div>
  `
})
export class SubTrusteeViewComponent implements OnInit {
  // In a real app this comes from auth token / route param
  subTrusteeId = input<number>(1);

  private svc = inject(PaymentService);

  loading = signal(true);
  error   = signal<string | null>(null);
  detail  = signal<SubTrusteeDetail | null>(null);
  copied  = signal(false);

  ngOnInit() {
    this.svc.getSubTrusteeDetail(this.subTrusteeId()).subscribe({
      next:  d  => { this.detail.set(d); this.loading.set(false); },
      error: e  => { this.error.set(e.message); this.loading.set(false); }
    });
  }

  initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  copyDetails(d: SubTrusteeDetail) {
    const text = `Account Number: ${d.accountNumber}\nIFSC: ${d.ifsc}\nBank: ${d.bankName}`;
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
