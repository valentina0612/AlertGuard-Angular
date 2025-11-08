import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoService } from '../services/video.service';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { MatSnackBar } from '@angular/material/snack-bar'
import { environment } from '../enviroments/enviaroments.prod';
// ✅ Importa environment

// Declaración de html2pdf para TypeScript
declare const html2pdf: any;

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
      color: element.style.color,
      maxHeight: element.style.maxHeight,
      overflow: element.style.overflow
    };

    // Aplicar estilos para impresión
    element.style.width = '100%';
    element.style.padding = '20px';
    element.style.backgroundColor = '#FFFFFF';
    element.style.color = '#000000';
    element.style.maxHeight = 'none'; // Permitir todo el contenido
    element.style.overflow = 'visible'; // Hacer visible todo el contenido
    element.classList.add('pdf-export');

    // Ocultar elementos no deseados en la impresión
    const elementsToHide = document.querySelectorAll('.download-section, .toggle-details-btn, .app-footer, .download-buttons');
    elementsToHide.forEach((el: any) => {
      el.style.display = 'none';
    });

    // Realizar la impresión con un pequeño delay para que los estilos se apliquen
    setTimeout(() => {
      window.print();
    }, 100);

    // Restaurar estilos después de imprimir
    setTimeout(() => {
      element.style.width = originalStyles.width;
      element.style.padding = originalStyles.padding;
      element.style.backgroundColor = originalStyles.backgroundColor;
      element.style.color = originalStyles.color;
      element.style.maxHeight = originalStyles.maxHeight;
      element.style.overflow = originalStyles.overflow;
      element.classList.remove('pdf-export');

      // Mostrar elementos ocultos
      elementsToHide.forEach((el: any) => {
        el.style.display = '';
      });
    }, 1000);
  }

  // Método para descargar el reporte como PDF con colores sólidos
  downloadPDF() {
    const element = document.getElementById('report-content');
    if (!element) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se encontró el contenido del reporte.',
        confirmButtonText: 'Aceptar'
      });
      return;
    }

    // Mostrar mensaje de carga
    Swal.fire({
      title: 'Generando PDF...',
      html: 'Por favor espera un momento<br><small>Esto puede tomar unos segundos</small>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Pequeño delay para que el mensaje de carga se muestre
    setTimeout(() => {
      this.generatePDF(element);
    }, 100);
  }

  private generatePDF(element: HTMLElement) {
    // Guardar estilos originales
    const originalStyles = {
      width: element.style.width,
      padding: element.style.padding,
      backgroundColor: element.style.backgroundColor,
      color: element.style.color,
      maxWidth: element.style.maxWidth,
      opacity: element.style.opacity,
      overflow: element.style.overflow,
      height: element.style.height,
      margin: element.style.margin
    };

    // Aplicar estilos forzados para PDF - COLORES SÓLIDOS y CENTRADO
    element.style.width = '190mm';
    element.style.maxWidth = '190mm';
    element.style.padding = '10mm';
    element.style.margin = '0 auto';
    element.style.backgroundColor = '#FFFFFF';
    element.style.color = '#000000';
    element.style.opacity = '1';
    element.style.overflow = 'visible';
    element.style.height = 'auto';
    element.classList.add('pdf-export');

    // Forzar colores sólidos en todos los elementos hijos
    const allElements = element.querySelectorAll('*');
    const originalElementStyles: Map<Element, string> = new Map();

    allElements.forEach((el: any) => {
      // Guardar estilos originales
      originalElementStyles.set(el, el.style.cssText);

      // Eliminar transparencias y blur
      el.style.opacity = '1';
      el.style.backdropFilter = 'none';
      el.style.webkitBackdropFilter = 'none';

      // Forzar backgrounds sólidos
      const computedStyle = window.getComputedStyle(el);
      if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const bgColor = computedStyle.backgroundColor;
        // Convertir rgba a rgb si es necesario
        if (bgColor.includes('rgba')) {
          const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (rgbaMatch) {
            el.style.backgroundColor = `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
          }
        }
      }
    });

    // Ocultar elementos no deseados
    const elementsToHide = document.querySelectorAll('.download-section, .toggle-details-btn, .app-footer, .download-buttons');
    elementsToHide.forEach((el: any) => {
      el.style.display = 'none';
    });

    // Configuración OPTIMIZADA para capturar TODO el contenido sin páginas en blanco
    const opt = {
      margin: [10, 10, 10, 10], // Márgenes uniformes
      filename: `Reporte-Analisis-${this.sessionId || new Date().getTime()}.pdf`,
      image: {
        type: 'jpeg',
        quality: 0.98
      },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
        windowWidth: 800,
        windowHeight: element.scrollHeight,
        removeContainer: false,
        imageTimeout: 15000,
        foreignObjectRendering: false,
        onclone: (clonedDoc: Document) => {
          const clonedElement = clonedDoc.getElementById('report-content');
          if (clonedElement) {
            const htmlEl = clonedElement as HTMLElement;
            htmlEl.style.display = 'block';
            htmlEl.style.height = 'auto';
            htmlEl.style.overflow = 'visible';
            htmlEl.style.width = '100%';
            htmlEl.style.maxWidth = '100%';
            htmlEl.style.margin = '0';
            htmlEl.style.padding = '20px';
            htmlEl.style.pageBreakInside = 'avoid';
          }
        }
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true
      },
      pagebreak: {
        mode: 'avoid-all',
        avoid: ['.result-card', '.results-header', '.security-summary', '.detections-detail', '.detection-item']
      },
      enableLinks: false
    };

    console.log('Iniciando generación de PDF...');
    console.log('Altura del elemento:', element.offsetHeight);
    console.log('Scroll height:', element.scrollHeight);

    // Generar y descargar el PDF con TODO el contenido
    html2pdf()
      .set(opt)
      .from(element)
      .toPdf()
      .get('pdf')
      .then((pdf: any) => {
        // Obtener información del PDF
        const totalPages = pdf.internal.getNumberOfPages();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const pageWidth = pdf.internal.pageSize.getWidth();

        console.log(`PDF generado con ${totalPages} página(s)`);
        console.log(`Dimensiones: ${pageWidth}mm x ${pageHeight}mm`);

        // Agregar número de página y footer en cada página
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);

          // Número de página
          pdf.setFontSize(9);
          pdf.setTextColor(120, 120, 120);
          pdf.text(
            `Página ${i} de ${totalPages}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: 'center' }
          );

          // Info del reporte
          if (i === 1) {
            pdf.setFontSize(8);
            pdf.text(
              `Reporte de Análisis - ID: ${this.sessionId || 'N/A'}`,
              10,
              pageHeight - 8
            );
          }

          // Fecha
          pdf.setFontSize(8);
          pdf.text(
            new Date().toLocaleDateString('es-ES'),
            pageWidth - 10,
            pageHeight - 8,
            { align: 'right' }
          );
        }

        return pdf;
      })
      .save()
      .then(() => {
        console.log('PDF guardado exitosamente');
        this.restoreStyles(element, originalStyles, originalElementStyles, elementsToHide, true);
      })
      .catch((error: any) => {
        console.error('Error generando PDF:', error);
        console.error('Stack:', error.stack);
        this.restoreStyles(element, originalStyles, originalElementStyles, elementsToHide, false);
      });
  }

  private restoreStyles(
    element: HTMLElement,
    originalStyles: any,
    originalElementStyles: Map<Element, string>,
    elementsToHide: NodeListOf<Element>,
    success: boolean
  ) {
    // Restaurar estilos del elemento principal
    element.style.width = originalStyles.width;
    element.style.maxWidth = originalStyles.maxWidth;
    element.style.padding = originalStyles.padding;
    element.style.backgroundColor = originalStyles.backgroundColor;
    element.style.color = originalStyles.color;
    element.style.opacity = originalStyles.opacity;
    element.style.overflow = originalStyles.overflow;
    element.style.height = originalStyles.height;
    element.style.margin = originalStyles.margin;
    element.classList.remove('pdf-export');

    // Restaurar estilos de todos los elementos hijos
    originalElementStyles.forEach((styleText, el) => {
      (el as any).style.cssText = styleText;
    });

    // Mostrar elementos ocultos
    elementsToHide.forEach((el: any) => {
      el.style.display = '';
    });

    // Mostrar mensaje de resultado
    if (success) {
      Swal.fire({
        icon: 'success',
        title: 'PDF Descargado',
        text: 'El reporte ha sido descargado correctamente en tu carpeta de descargas.',
        confirmButtonText: 'Aceptar',
        timer: 4000,
        timerProgressBar: true
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error al Generar PDF',
        text: 'Hubo un error al generar el PDF. Por favor intenta de nuevo.',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  ngOnDestroy() {
    this.videoService.disconnect();
  }
}
