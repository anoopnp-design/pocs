import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { DashboardComponent } from './app/dashboard/dashboard.component';
import { SubTrusteeViewComponent } from './app/sub-trustee-view/sub-trustee-view.component';

const routes = [
  { path: '', component: DashboardComponent },
  { path: 'sub-trustee/:id', component: SubTrusteeViewComponent },
  { path: '**', redirectTo: '' }
];

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideRouter(routes)]
}).catch(err => console.error(err));
