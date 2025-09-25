import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoService } from '../services/video.service';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { MatSnackBar } from '@angular/material/snack-bar'
import { environment } from '../enviroments/enviaroments.prod';
// ✅ Importa environment

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

  // ✅ Variables usadas en el HTML
  progress: number = 0;           // Avance en porcentaje (0-100)
  anomalyConfidence: number = 85; // Confianza de anomalía
  processedFrames: number = 0;    // Frames procesados
  totalFrames: number = 100;      // Total estimado de frames (ajustar según video)
  videoUploaded: boolean = false;
  videoFinished: boolean = false;
  showDetails: boolean = false;
  hasAnomaly: boolean = false;
  analysisResults: any = null;

  constructor(
    private videoService: VideoService,
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    Swal.fire({
      icon: 'info',
      title: 'Bienvenido',
      text: 'El video no debe superar los 50 MB y será almacenado para mejorar el sistema.',
      confirmButtonText: 'Aceptar'
    });
  }
    
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.statusMessage = 'Subiendo...';
    this.videoUploaded = true;
    this.videoFinished = false;
    this.hasAnomaly = false;
    this.processedFrames = 0;
    this.progress = 0;
    this.analysisResults = null;
    
    this.videoService.uploadVideo(file).subscribe({
      next: (res) => {
        this.sessionId = res.session_id;
        this.statusMessage = 'Procesando...';

        // Verificar que el video no pese más de 50MB
        if (file.size > 50 * 1024 * 1024) {
          Swal.fire({
            icon: 'warning',
            title: 'Archivo muy grande',
            text: 'El archivo supera los 50MB. Por favor, suba un archivo más pequeño.',
            confirmButtonText: 'Aceptar'
          });
          this.videoUploaded = false;
          return;
        }
        
        // Estimar total de frames basado en duración del video (ejemplo)
        this.estimateTotalFrames(file);
        
        Swal.fire({
          icon: 'success',
          title: 'Video subido correctamente',
          text: 'Subiendo video a la base de datos.',
          confirmButtonText: 'Aceptar'
        });

        // 🚀 Abrir conexión WS
        this.videoService.connect(
          this.sessionId,
          (url) => {
            this.frameUrl = url;
            this.processedFrames++;
            this.updateProgress(); // Actualizar progreso con cada frame
          },
          () => {
            this.statusMessage = '⚠️ ALERTA DETECTADA';
            this.hasAnomaly = true;
            this.alerta();
          },
          async () => {
            this.statusMessage = '⏳ Procesamiento terminado, obteniendo resultados...';
            this.progress = 100; // Completar al 100% al terminar
    
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
        this.videoUploaded = false;
      }
    });
  }

  // Método para estimar el total de frames del video
  private estimateTotalFrames(file: File) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      // Estimación: 30 frames por segundo × duración en segundos
      const duration = video.duration;
      this.totalFrames = Math.round(duration * 30); // 30 FPS
      URL.revokeObjectURL(video.src);
    };
    
    video.onerror = () => {
      // Si no se puede obtener la duración, usar un valor por defecto
      this.totalFrames = 300; // Valor por defecto
    };
  }

  // Método para actualizar el progreso
  private updateProgress() {
    if (this.totalFrames > 0) {
      this.progress = Math.min(100, Math.round((this.processedFrames / this.totalFrames) * 100));
    } else {
      // Si no tenemos total, usar incremento gradual
      this.progress = Math.min(100, this.progress + 1);
    }
    
    // Simular progreso más suave si el avance es muy lento
    if (this.progress < 95 && this.processedFrames > 0) {
      setTimeout(() => {
        // Pequeño incremento adicional para simular progreso continuo
        if (this.progress < 95) {
          this.progress = Math.min(95, this.progress + 0.5);
        }
      }, 1000);
    }
  }

  alerta() {
    // reproducir sonido
    const audio = new Audio();
    audio.src = 'assets/Alarma.mp3';
    audio.load();
    audio.play();

    // mostrar snackbar
    this.snackBar.open(
      'Se ha detectado una anomalía en el video.',
      'Aceptar',
      {
        duration: 5000,
        horizontalPosition: 'right',
        verticalPosition: 'top',
        panelClass: ['snackbar-warning']
      }
    );
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
      const res = await this.http.put(
        `${environment.backendUrl}/results/${session_id}/save`, // ✅ Environment
        null
      ).toPromise();
      Swal.fire({
        icon: 'success',
        title: 'Resultados guardados',
        text: 'Los resultados del análisis han sido guardados en la base de datos.',
        confirmButtonText: 'Aceptar'
      });
    } catch (err) {
      console.error('Error guardando resultados:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Hubo un error al guardar los resultados en la base de datos.',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  // 📡 Consulta directa al backend
  async fetchAnalysisResults(sessionId: string): Promise<any> {
    return this.http
      .get<any>(`${environment.backendUrl}/results/${sessionId}`) // ✅ Environment
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
