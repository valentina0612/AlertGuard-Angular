import { Routes } from '@angular/router';
import { AnalisisVideoComponent } from './analisis-video/analisis-video.component';

export const routes: Routes = [
  { path: '', component: AnalisisVideoComponent },  // Ruta raíz
  { path: 'analisis-video', component: AnalisisVideoComponent },  // Ruta específica
  { path: '**', redirectTo: '' }  // Ruta comodín AL FINAL
];
