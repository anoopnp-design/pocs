// ============================================================
//  payment.service.ts  —  Angular 21 HTTP Service
//  All amounts in INR as JavaScript numbers (2 decimal places)
// ============================================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../environments/environment';

// ── Interfaces (mirror backend DTOs) ─────────────────────────

export interface SubTrustee {
  id: number;
  name: string;
  email: string;
  razorpayCustomerId?: string;
  razorpayVAId?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  createdAt: string;
}

export interface CreateSubTrusteeRequest {
  name: string;
  email: string;
}

export interface SetExpectationRequest {
  subTrusteeId: number;
  expectedAmount: number;
  description?: string;
  dueDate: string;  // ISO 8601
}

export interface PaymentExpectation {
  id: number;
  subTrusteeId: number;
  expectedAmount: number;
  description?: string;
  dueDate: string;
  status: 'Pending' | 'PartiallyPaid' | 'Fulfilled' | 'Overdue';
}

export interface Transaction {
  razorpayPaymentId: string;
  amount: number;
  utr?: string;
  paymentMethod?: string;
  receivedAt: string;
}

export interface TrusteeStatusRow {
  id: number;
  name: string;
  email: string;
  accountNumber?: string;
  ifsc?: string;
  totalExpected: number;
  totalPaid: number;
  pending: number;
  lastPayment?: string;
}

export interface DashboardData {
  totalExpected: number;
  totalPaid: number;
  pendingBalance: number;
  subTrustees: TrusteeStatusRow[];
}

export interface SubTrusteeDetail {
  id: number;
  name: string;
  email: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  totalExpected: number;
  totalPaid: number;
  transactions: Transaction[];
}

export interface ApiError {
  error: string;
}

// ── Service ───────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/api`;

  // ── Dashboard ──────────────────────────────────────────────
  getDashboard(): Observable<DashboardData> {
    return this.http
      .get<DashboardData>(`${this.base}/trustees/dashboard`)
      .pipe(catchError(this.handleError));
  }

  // ── Sub-Trustee CRUD ───────────────────────────────────────
  createSubTrustee(req: CreateSubTrusteeRequest): Observable<SubTrustee> {
    return this.http
      .post<SubTrustee>(`${this.base}/trustees`, req)
      .pipe(catchError(this.handleError));
  }

  getSubTrusteeDetail(id: number): Observable<SubTrusteeDetail> {
    return this.http
      .get<SubTrusteeDetail>(`${this.base}/trustees/${id}`)
      .pipe(catchError(this.handleError));
  }

  // ── Expectations ───────────────────────────────────────────
  setExpectation(req: SetExpectationRequest): Observable<PaymentExpectation> {
    return this.http
      .post<PaymentExpectation>(
        `${this.base}/trustees/${req.subTrusteeId}/expectations`, req)
      .pipe(catchError(this.handleError));
  }

  // ── Formatting helpers ─────────────────────────────────────
  formatINR(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // ── Error handler ──────────────────────────────────────────
  private handleError(err: HttpErrorResponse): Observable<never> {
    let message = 'An unexpected error occurred.';
    if (err.status === 0) {
      message = 'Cannot connect to the server. Please check your network.';
    } else if (err.error?.error) {
      message = err.error.error;
    } else if (err.status === 409) {
      message = 'A Sub-Trustee with this email already exists.';
    } else if (err.status === 502) {
      message = 'Payment gateway error. Please try again later.';
    }
    return throwError(() => new Error(message));
  }
}
