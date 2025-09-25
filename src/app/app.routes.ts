import { Routes } from '@angular/router';
import { AnalisisVideoComponent } from './analisis-video/analisis-video.component';


export const routes: Routes = [
  { path: '', component: AnalisisVideoComponent },
  {path: '**', redirectTo: ''},  // Ruta comodín para manejar rutas no definidas
  {path: 'analisis-video', component: AnalisisVideoComponent}
];
