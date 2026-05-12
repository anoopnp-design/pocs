// ============================================================
//  trustee-dashboard.component.ts  —  Angular 21
// ============================================================

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import {
  PaymentService,
  DashboardData,
  TrusteeStatusRow,
  CreateSubTrusteeRequest,
  SetExpectationRequest
} from '../../services/payment.service';

@Component({
  selector: 'app-trustee-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, CurrencyPipe, DatePipe],
  template: `
    <!-- ── Header ── -->
    <div class="min-h-screen bg-gray-50">
      <div class="max-w-7xl mx-auto px-6 py-8">

        <div class="flex items-center justify-between mb-8">
          <div>
            <p class="text-xs uppercase tracking-widest text-gray-400 mb-1">Main Trustee Portal</p>
            <h1 class="text-2xl font-semibold text-gray-900">Payment Collection</h1>
          </div>
          <button
            (click)="showAddModal.set(true)"
            class="flex items-center gap-2 bg-gray-900 text-white px-4 py-2
                   rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Sub-Trustee
          </button>
        </div>

        <!-- ── Error Banner ── -->
        @if (error()) {
          <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
            <span>{{ error() }}</span>
            <button (click)="error.set(null)" class="text-red-400 hover:text-red-600">✕</button>
          </div>
        }

        <!-- ── Loading ── -->
        @if (loading()) {
          <div class="flex justify-center items-center h-64">
            <div class="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
          </div>
        } @else if (dashboard()) {

          <!-- ── Metric Cards ── -->
          <div class="grid grid-cols-3 gap-4 mb-8">
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Total Expected</p>
              <p class="text-2xl font-semibold text-blue-600">
                {{ dashboard()!.totalExpected | currency:'INR':'symbol':'1.2-2' }}
              </p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Total Paid</p>
              <p class="text-2xl font-semibold text-emerald-600">
                {{ dashboard()!.totalPaid | currency:'INR':'symbol':'1.2-2' }}
              </p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">Pending Balance</p>
              <p class="text-2xl font-semibold text-amber-600">
                {{ dashboard()!.pendingBalance | currency:'INR':'symbol':'1.2-2' }}
              </p>
            </div>
          </div>

          <!-- ── Filter Tabs ── -->
          <div class="flex gap-1 bg-gray-100 p-1 rounded-lg inline-flex mb-4">
            @for (tab of tabs; track tab.key) {
              <button
                (click)="activeTab.set(tab.key)"
                [class]="activeTab() === tab.key
                  ? 'px-4 py-1.5 rounded-md bg-white text-gray-900 text-sm font-medium shadow-sm'
                  : 'px-4 py-1.5 rounded-md text-gray-500 text-sm hover:text-gray-700'">
                {{ tab.label }}
              </button>
            }
          </div>

          <!-- ── Trustee Table ── -->
          <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <!-- Table Header -->
            <div class="grid grid-cols-[1fr_120px_120px_120px_100px_44px]
                        gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100
                        text-xs text-gray-400 uppercase tracking-wide font-medium">
              <span>Sub-Trustee</span>
              <span class="text-right">Expected</span>
              <span class="text-right">Paid</span>
              <span class="text-right">Pending</span>
              <span class="text-center">Status</span>
              <span></span>
            </div>

            <!-- Rows -->
            @for (t of filteredTrustees(); track t.id) {
              <div
                (click)="openDetail(t.id)"
                class="grid grid-cols-[1fr_120px_120px_120px_100px_44px]
                       gap-3 px-4 py-3 border-b border-gray-50
                       hover:bg-gray-50 cursor-pointer transition-colors items-center
                       last:border-b-0">
                <!-- Name / Email -->
                <div>
                  <p class="text-sm font-medium text-gray-900">{{ t.name }}</p>
                  <p class="text-xs text-gray-400">{{ t.email }}</p>
                  <div class="mt-1 h-1 w-24 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full bg-emerald-500 rounded-full transition-all duration-500"
                         [style.width]="getPercent(t) + '%'"></div>
                  </div>
                </div>
                <p class="text-sm text-right text-gray-700">{{ t.totalExpected | currency:'INR':'symbol':'1.0-0' }}</p>
                <p class="text-sm text-right text-emerald-600 font-medium">{{ t.totalPaid | currency:'INR':'symbol':'1.0-0' }}</p>
                <p class="text-sm text-right font-medium"
                   [class]="t.pending > 0 ? 'text-amber-600' : 'text-emerald-600'">
                  {{ t.pending | currency:'INR':'symbol':'1.0-0' }}
                </p>
                <div class="flex justify-center">
                  <span [class]="getStatusClass(t)" class="text-xs px-2 py-0.5 rounded-full font-medium">
                    {{ getStatusLabel(t) }}
                  </span>
                </div>
                <button
                  (click)="$event.stopPropagation(); openExpectation(t)"
                  class="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Set expectation">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24"
                       fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            } @empty {
              <div class="py-16 text-center text-gray-400 text-sm">
                No sub-trustees in this view.
              </div>
            }
          </div>
        }

      </div>
    </div>

    <!-- ── Add Sub-Trustee Modal ── -->
    @if (showAddModal()) {
      <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4"
           (click)="showAddModal.set(false)">
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
             (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold">Add Sub-Trustee</h2>
            <button (click)="showAddModal.set(false)" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <p class="text-xs text-gray-400 mb-4">
            This will create a Razorpay Customer and a dedicated Virtual Account automatically.
          </p>

          <label class="block text-xs text-gray-500 mb-1">Full name</label>
          <input [(ngModel)]="newTrustee.name"
                 placeholder="Arjun Mehta"
                 class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />

          <label class="block text-xs text-gray-500 mb-1">Email address</label>
          <input [(ngModel)]="newTrustee.email" type="email"
                 placeholder="arjun@company.com"
                 class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />

          <div class="flex gap-2 mt-5 justify-end">
            <button (click)="showAddModal.set(false)"
                    class="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button (click)="createSubTrustee()"
                    [disabled]="saving()"
                    class="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg
                           hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {{ saving() ? 'Creating…' : 'Create & Generate VA' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Set Expectation Modal ── -->
    @if (showExpModal()) {
      <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4"
           (click)="showExpModal.set(false)">
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
             (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-base font-semibold">Set Payment Expectation</h2>
            <button (click)="showExpModal.set(false)" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <p class="text-xs text-gray-400 mb-4">For: {{ selectedTrustee()?.name }}</p>

          <label class="block text-xs text-gray-500 mb-1">Expected amount (₹)</label>
          <input [(ngModel)]="expectation.expectedAmount" type="number" step="0.01" min="1"
                 placeholder="25000.00"
                 class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />

          <label class="block text-xs text-gray-500 mb-1">Description</label>
          <input [(ngModel)]="expectation.description"
                 placeholder="Q2 2025 quarterly contribution"
                 class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />

          <label class="block text-xs text-gray-500 mb-1">Due date</label>
          <input [(ngModel)]="expectation.dueDate" type="date"
                 class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />

          <div class="flex gap-2 mt-5 justify-end">
            <button (click)="showExpModal.set(false)"
                    class="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button (click)="saveExpectation()"
                    [disabled]="saving()"
                    class="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg
                           hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {{ saving() ? 'Saving…' : 'Set Expectation' }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class TrusteeDashboardComponent implements OnInit {
  private svc = inject(PaymentService);

  // ── State ──
  loading   = signal(true);
  saving    = signal(false);
  error     = signal<string | null>(null);
  dashboard = signal<DashboardData | null>(null);
  activeTab = signal<'all'|'overdue'|'paid'>('all');

  showAddModal = signal(false);
  showExpModal = signal(false);
  selectedTrustee = signal<TrusteeStatusRow | null>(null);

  newTrustee: CreateSubTrusteeRequest = { name: '', email: '' };
  expectation: Partial<SetExpectationRequest> = { dueDate: this.defaultDueDate() };

  tabs = [
    { key: 'all'    as const, label: 'All trustees' },
    { key: 'overdue'as const, label: 'Overdue'      },
    { key: 'paid'   as const, label: 'Fully paid'   },
  ];

  // ── Computed ──
  filteredTrustees = computed(() => {
    const d = this.dashboard();
    if (!d) return [];
    const rows = d.subTrustees;
    switch (this.activeTab()) {
      case 'overdue': return rows.filter(t => t.pending > 0);
      case 'paid':    return rows.filter(t => t.pending <= 0 && t.totalExpected > 0);
      default:        return rows;
    }
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.getDashboard().subscribe({
      next:  d  => { this.dashboard.set(d); this.loading.set(false); },
      error: e  => { this.error.set(e.message); this.loading.set(false); }
    });
  }

  createSubTrustee() {
    if (!this.newTrustee.name || !this.newTrustee.email) return;
    this.saving.set(true);
    this.svc.createSubTrustee(this.newTrustee).subscribe({
      next: () => {
        this.saving.set(false);
        this.showAddModal.set(false);
        this.newTrustee = { name: '', email: '' };
        this.load();
      },
      error: e => { this.saving.set(false); this.error.set(e.message); }
    });
  }

  openExpectation(t: TrusteeStatusRow) {
    this.selectedTrustee.set(t);
    this.expectation = { subTrusteeId: t.id, dueDate: this.defaultDueDate() };
    this.showExpModal.set(true);
  }

  saveExpectation() {
    const req = this.expectation as SetExpectationRequest;
    if (!req.expectedAmount || req.expectedAmount <= 0) return;
    this.saving.set(true);
    this.svc.setExpectation(req).subscribe({
      next: () => {
        this.saving.set(false);
        this.showExpModal.set(false);
        this.load();
      },
      error: e => { this.saving.set(false); this.error.set(e.message); }
    });
  }

  openDetail(id: number) {
    // Navigate to /sub-trustee/:id or open a detail modal
    console.log('Open detail for trustee', id);
  }

  getPercent(t: TrusteeStatusRow): number {
    if (t.totalExpected === 0) return 0;
    return Math.min(100, (t.totalPaid / t.totalExpected) * 100);
  }

  getStatusLabel(t: TrusteeStatusRow): string {
    if (t.totalPaid >= t.totalExpected && t.totalExpected > 0) return 'Paid';
    if (t.totalPaid > 0) return 'Partial';
    return 'Pending';
  }

  getStatusClass(t: TrusteeStatusRow): string {
    if (t.totalPaid >= t.totalExpected && t.totalExpected > 0)
      return 'bg-emerald-50 text-emerald-700';
    if (t.totalPaid > 0)
      return 'bg-blue-50 text-blue-700';
    return 'bg-amber-50 text-amber-700';
  }

  private defaultDueDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }
}
