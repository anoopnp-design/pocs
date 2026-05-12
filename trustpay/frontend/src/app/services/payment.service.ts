import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

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
  dueDate: string;
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

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/trustees`;

  getDashboard(): Observable<DashboardData> {
    return this.http
      .get<DashboardData>(`${this.base}/dashboard`)
      .pipe(catchError(this.handleError));
  }

  createSubTrustee(request: CreateSubTrusteeRequest): Observable<SubTrustee> {
    return this.http
      .post<SubTrustee>(this.base, request)
      .pipe(catchError(this.handleError));
  }

  getSubTrusteeDetail(id: number): Observable<SubTrusteeDetail> {
    return this.http
      .get<SubTrusteeDetail>(`${this.base}/${id}`)
      .pipe(catchError(this.handleError));
  }

  setExpectation(request: SetExpectationRequest): Observable<PaymentExpectation> {
    return this.http
      .post<PaymentExpectation>(`${this.base}/${request.subTrusteeId}/expectations`, request)
      .pipe(catchError(this.handleError));
  }

  formatINR(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private handleError(err: HttpErrorResponse): Observable<never> {
    let message = 'An unexpected error occurred.';
    if (err.status === 0) {
      message = 'Cannot connect to the server. Check that the backend is running.';
    } else if (err.error?.error) {
      message = err.error.error;
    } else if (err.status === 409) {
      message = 'A Sub-Trustee with this email already exists.';
    }
    return throwError(() => new Error(message));
  }
}
