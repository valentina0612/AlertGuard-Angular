import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../enviroments/enviaroments.prod';


@Injectable({
  providedIn: 'root'
})
export class VideoService {
  private apiUrl = environment.backendUrl; // FastAPI
  private ws: WebSocket | null = null;
  private wsConnections: WebSocket[] = []; // Array para workers paralelos
  private readonly NUM_WORKERS = 3; // Número de workers paralelos (configurable)

  // Buffer para ordenar frames
  private frameBuffer: Map<number, string> = new Map();
  private nextFrameToShow = 1; // Próximo frame a mostrar

  constructor(private http: HttpClient) {}

  // 📌 1. Subir video al backend
  uploadVideo(file: File): Observable<{ session_id: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ session_id: string }>(`${this.apiUrl}/upload`, formData);
  }

  // 📌 2. Conectarse al WebSocket para recibir frames (versión original - compatibilidad)
  connect(
    sessionId: string,
    onFrame: (frameUrl: string) => void,
    onAlert: (msg: string) => void,
    onEnd: () => void
  ): void {
    const wsUrl = this.apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    this.ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    this.ws.onmessage = (event) => {
      // 👉 Caso 1: mensaje binario (frame en JPEG)
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          onFrame(reader.result as string); // data:image/jpeg;base64,...
        };
        reader.readAsDataURL(event.data);
      }
      // 👉 Caso 2: mensaje texto (JSON)
      else if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'alert') {
            onAlert(data.message || '⚠️ Anomalía detectada');
          } else if (data.type === 'end') {
            onEnd();
          }
        } catch (err) {
          console.error('❌ Error procesando JSON WS:', err);
        }
      }
    };

    this.ws.onerror = (err) => {
      console.error('❌ Error en WebSocket:', err);
    };

    this.ws.onclose = () => {
      console.log('🔌 WS cerrado');
    };
  }

  // 📌 2b. Conectarse con múltiples workers en paralelo (NUEVO)
  connectParallel(
    sessionId: string,
    onFrame: (frameUrl: string) => void,
    onAlert: (msg: string) => void,
    onEnd: () => void,
    numWorkers: number = this.NUM_WORKERS
  ): void {
    let completedWorkers = 0;
    const workersStats: { [key: number]: number } = {};

    // Resetear buffer de frames
    this.frameBuffer.clear();
    this.nextFrameToShow = 1;

    console.log(`🚀 Iniciando ${numWorkers} workers paralelos para sesión ${sessionId}`);

    // Convertir la URL HTTP a WebSocket (ws:// o wss://)
    const wsUrl = this.apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');

    // Crear múltiples conexiones WebSocket
    for (let i = 0; i < numWorkers; i++) {
      const ws = new WebSocket(
        `${wsUrl}/ws/${sessionId}/worker-${i}`
      );

      ws.onopen = () => {
        console.log(`✅ Worker ${i} conectado`);
      };

      ws.onmessage = (event) => {
        // �� Caso: mensaje texto (JSON)
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'start') {
              console.log(`🔄 ${data.message}`);

            } else if (data.type === 'frame') {
              // Frame recibido con número de secuencia
              const frameNumber = data.frame_number;
              const frameData = `data:image/jpeg;base64,${data.data}`;

              // Guardar en buffer
              this.frameBuffer.set(frameNumber, frameData);

              // Mostrar frames en orden
              this.showOrderedFrames(onFrame);

            } else if (data.type === 'alert') {
              onAlert(data.message || '⚠️ Anomalía detectada');

            } else if (data.type === 'end') {
              completedWorkers++;
              workersStats[data.worker_id] = data.frames_processed || 0;

              console.log(`✅ Worker ${data.worker_id} completado. Frames procesados: ${data.frames_processed}`);
              console.log(`📊 Progreso: ${completedWorkers}/${numWorkers} workers completados`);

              // Solo llamar onEnd cuando TODOS los workers terminen
              if (completedWorkers === numWorkers) {
                const totalFrames = Object.values(workersStats).reduce((a, b) => a + b, 0);
                console.log(`🎉 Todos los workers completados. Total frames procesados: ${totalFrames}`);

                // Mostrar frames restantes
                this.flushRemainingFrames(onFrame);
                onEnd();
              }
            }
          } catch (err) {
            console.error('❌ Error procesando JSON WS:', err);
          }
        }
      };

      ws.onerror = (err) => {
        console.error(`❌ Error en Worker ${i}:`, err);
      };

      ws.onclose = () => {
        console.log(`🔌 Worker ${i} cerrado`);
      };

      this.wsConnections.push(ws);
    }
  }

  // Mostrar frames en orden secuencial
  private showOrderedFrames(onFrame: (frameUrl: string) => void): void {
    while (this.frameBuffer.has(this.nextFrameToShow)) {
      const frame = this.frameBuffer.get(this.nextFrameToShow)!;
      onFrame(frame);
      this.frameBuffer.delete(this.nextFrameToShow);
      this.nextFrameToShow++;
    }
  }

  // Mostrar frames restantes al final
  private flushRemainingFrames(onFrame: (frameUrl: string) => void): void {
    const sortedFrames = Array.from(this.frameBuffer.entries())
      .sort((a, b) => a[0] - b[0]);

    for (const [_, frameData] of sortedFrames) {
      onFrame(frameData);
    }

    this.frameBuffer.clear();
  }

  // 📌 3. Cerrar todas las conexiones
  disconnect(): void {
    // Cerrar conexión simple
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Cerrar todas las conexiones de workers paralelos
    if (this.wsConnections.length > 0) {
      console.log(`🔌 Cerrando ${this.wsConnections.length} workers...`);
      this.wsConnections.forEach(ws => ws.close());
      this.wsConnections = [];
    }

    // Limpiar buffer de frames
    this.frameBuffer.clear();
    this.nextFrameToShow = 1;
  }
}
