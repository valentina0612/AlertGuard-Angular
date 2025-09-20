import { Component, OnDestroy } from '@angular/core';
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
export class AnalisisVideoComponent implements OnDestroy {
  statusMessage = '';
  frameUrl: string | null = null; 
  private sessionId: string | null = null;

  analysisResults: any = null;

  hasAnomaly: boolean = false;
  processedFrames: number = 0;
  videoUploaded: boolean = false;
  videoFinished: boolean = false;
  showDetails: boolean = false;

  constructor(
    private videoService: VideoService,
    private http: HttpClient
  ) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.statusMessage = 'Subiendo...';
    this.videoUploaded = true;
    this.videoFinished = false;
    this.hasAnomaly = false;
    this.processedFrames = 0;
    this.analysisResults = null;
    
    this.videoService.uploadVideo(file).subscribe({
      next: (res) => {
        this.sessionId = res.session_id;
        this.statusMessage = 'Procesando...';
        alert('Video subido correctamente. ID de sesión: ' + this.sessionId);

        // 🚀 Abrir conexión WS
        this.videoService.connect(
          this.sessionId,
          (url) => {
            this.frameUrl = url;
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
    await this.uploadResults(sessionId); // llamada inicial
    return new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res: any = await this.fetchAnalysisResults(sessionId);
          if (res?.status === 'completed') {
            this.analysisResults = res;
            clearInterval(interval);
            this.statusMessage = 'Análisis completado';
            resolve();
          }
        } catch (err) {
          console.error('Error obteniendo resultados:', err);
          clearInterval(interval);
          resolve();
        }
      }, 5000);
    });
  }

  async uploadResults(session_id: string) {
    try {
      const res = await this.http.put(`http://localhost:8000/results/${session_id}/save`, null).toPromise();
      alert('Resultados guardados en la base de datos.');
    } catch (err) {
      console.error('Error guardando resultados:', err);
      alert('Error guardando resultados.');
    }
  }

  // 📡 Consulta directa al backend
  async fetchAnalysisResults(sessionId: string): Promise<any> {
    return this.http
      .get<any>(`http://localhost:8000/results/${sessionId}`)
      .toPromise();
  }

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

  // Método para imprimir el reporte
  printReport() {
    const element = document.getElementById('report-content');
    if (!element) return;
    
    // Guardar estilos originales
    const originalStyles = {
      width: element.style.width,
      padding: element.style.padding,
      backgroundColor: element.style.backgroundColor,
      color: element.style.color
    };
    
    // Aplicar estilos para impresión
    element.style.width = '100%';
    element.style.padding = '20px';
    element.style.backgroundColor = '#FFFFFF';
    element.style.color = '#000000';
    element.classList.add('pdf-export');
    
    // Ocultar elementos no deseados en la impresión
    const elementsToHide = document.querySelectorAll('.download-section, .toggle-details-btn, .app-footer, .download-buttons');
    elementsToHide.forEach((el: any) => {
      el.style.display = 'none';
    });
    
    // Realizar la impresión
    window.print();
    
    // Restaurar estilos después de imprimir
    setTimeout(() => {
      element.style.width = originalStyles.width;
      element.style.padding = originalStyles.padding;
      element.style.backgroundColor = originalStyles.backgroundColor;
      element.style.color = originalStyles.color;
      element.classList.remove('pdf-export');
      
      // Mostrar elementos ocultos
      elementsToHide.forEach((el: any) => {
        el.style.display = '';
      });
    }, 500);
  }

  ngOnDestroy() {
    this.videoService.disconnect();
  }
}