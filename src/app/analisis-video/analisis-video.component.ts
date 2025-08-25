import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoService } from '../services/video.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-analisis-video',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analisis-video.component.html',
  styleUrls: ['./analisis-video.component.css']
})
export class AnalisisVideoComponent {
  statusMessage = '';
  frameUrl: string | null = null; 
  private sessionId: string | null = null;

  analysisResults: any = null; // 👉 aquí guardamos el JSON del backend

  constructor(
    private videoService: VideoService,
    private http: HttpClient
  ) {}

  
  hasAnomaly: boolean = false;
  processedFrames: number = 0;
  videoUploaded: boolean = false;
  videoFinished:boolean = false;
  onFileSelected(event: Event) {

    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.statusMessage = 'Subiendo...';
    this.videoUploaded = true;
    this.videoFinished = false;
    this.hasAnomaly = false;
    this.processedFrames = 0;
    
    this.videoService.uploadVideo(file).subscribe({
      next: (res) => {
        this.sessionId = res.session_id;
        this.statusMessage = 'Procesando...';

        // 🚀 Abrir conexión WS
        this.videoService.connect(
          this.sessionId,
          (url) => {
            this.frameUrl = url; // 👉 mostrar frames
            this.processedFrames++;
          },
          () => {
            this.statusMessage = '⚠️ ALERTA DETECTADA';
            this.hasAnomaly = true;
          },
          async () => {
            this.statusMessage = '⏳ Procesamiento terminado, obteniendo resultados...';
    
            // 🔄 arrancamos polling SOLO cuando llega "end"
            if (this.sessionId) {
              await this.pollAnalysisResults(this.sessionId);
              this.videoUploaded = false;
              this.videoFinished = true;
            }
          }
        );
      },
      error: () => {
        this.statusMessage = 'Error al subir o procesar.';
      }
    });
  }

  // 🔄 Polling al backend hasta obtener resultados
  async pollAnalysisResults(sessionId: string) {
    const interval = setInterval(async () => {
      try {
        const res: any = await this.fetchAnalysisResults(sessionId);
        if (res?.status === 'completed') {
          this.analysisResults = res;
          clearInterval(interval); // ✅ ya tenemos resultados
          this.statusMessage = '✅ Análisis completado';
        }
      } catch (err) {
        console.error('Error obteniendo resultados:', err);
      }
    }, 5000); // cada 5s
  }

  // 📡 Consulta directa al backend
  async fetchAnalysisResults(sessionId: string): Promise<any> {
    return this.http
      .get<any>(`http://localhost:8000/results/${sessionId}`)
      .toPromise();
  }

  showDetails: boolean = false;

  toggleDetails() {
    this.showDetails = !this.showDetails;
  }

getDetectionIcon(type: string) {
  const icons: { [key: string]: string } = {
      'weapon': '🔫',
      'covered_face': '🎭',
      'covered': '🎭',
      'abnormal_behavior': '⚠️',
      'abnormal': '⚠️',
      'abnormal_action': '⚠️',
      'normal_person': '👤',
      'person': '👤',
      'normal': '👤'
  };
  return icons[type] || '📦';
}

  ngOnDestroy() {
    this.videoService.disconnect();
  }
}
