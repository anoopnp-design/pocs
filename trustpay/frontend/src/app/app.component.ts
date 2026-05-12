import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuditPanelComponent } from './components/audit-panel/audit-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, AuditPanelComponent],
  template: `
    <div class="page-shell bg-slate-50">
      <div class="container">
        <header class="header-row mb-8 bg-white p-6 shadow-soft">
          <div>
            <p class="text-sm uppercase tracking-[0.24em] text-slate-500">B2B payment collection</p>
            <h1 class="mt-2 text-3xl font-semibold text-slate-950">Trustee Payment Portal</h1>
          </div>
          <nav>
            <a routerLink="/" class="btn-primary">Dashboard</a>
          </nav>
        </header>

        <router-outlet></router-outlet>
      </div>

      <app-audit-panel></app-audit-panel>
    </div>
  `
})
export class AppComponent {}
