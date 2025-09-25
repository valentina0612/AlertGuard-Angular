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

  constructor(private http: HttpClient) {}

  // 📌 1. Subir video al backend
  uploadVideo(file: File): Observable<{ session_id: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ session_id: string }>(`${this.apiUrl}/upload`, formData);
  }

  // 📌 2. Conectarse al WebSocket para recibir frames
  connect(
    sessionId: string,
    onFrame: (frameUrl: string) => void,
    onAlert: (msg: string) => void,
    onEnd: () => void
  ): void {
    this.ws = new WebSocket(`ws://alertguard-backend-production.up.railway.app/api/ws/${sessionId}`);

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

  // 📌 3. Cerrar conexión
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
