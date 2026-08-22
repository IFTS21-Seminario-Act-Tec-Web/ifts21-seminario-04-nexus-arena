// ============================================================
// NEXUS ARENA — main.js
// Identidad: Centro de E-Sports & Gaming High-End
//
// Este script gestiona la interactividad del frontend bajo una
// arquitectura desacoplada, orientada a conectarse con una API
// REST construida en FastAPI durante los sprints de backend.
//
// Responsabilidades de este archivo:
//   1. Actualización automática del año en el footer.
//   2. Comportamiento del Navbar dinámico y botón Back-to-Top.
//   3. Detección de sección activa mediante IntersectionObserver API.
//   4. Lógica de cálculo en tiempo real (Simulador de Setup / Cotizador).
//   5. Consulta pública de estado de puesto/pase (Patrón GET sin login).
//   6. Validación y preparación del Formulario de Contacto (HTML5 API).
// ============================================================

"use strict";


// ─── 1. AÑO DINÁMICO EN EL FOOTER ───────────────────────────
// Buenas prácticas: evita hardcodear fechas en el HTML y previene
// que el sitio quede desactualizado con el paso de los ciclos lectivos.

const yearSpan = document.getElementById('year');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}


// ─── 2. NAVBAR SCROLLED & BOTÓN "VOLVER ARRIBA" ──────────────
//
// El Navbar utiliza una técnica de optimización visual:
// - Carga transparente al inicio para apreciar la imagen del Hero.
// - Al superar los 30px de scroll vertical, se inyecta la clase
//   '.scrolled' que activa el fondo oscuro con backdrop-filter (blur).
//
// El botón 'backToTop' permanece oculto hasta los 400px de scroll
// para no interferir con la lectura del primer bloque de contenido.
//
// Optimización de rendimiento:
// El listener usa '{ passive: true }' para informar al navegador
// que no ejecutará 'event.preventDefault()', permitiendo que el
// hilo de renderizado del scroll fluya a 60/120 fps sin bloqueos.

const siteNav   = document.getElementById('siteNav');
const backToTop = document.getElementById('backToTop');

function handleScrollEffects() {
  const currentScrollY = window.scrollY;

  // Alterna la clase .scrolled según la posición actual del scroll
  siteNav?.classList.toggle('scrolled', currentScrollY > 30);

  // Muestra u oculta el botón flotante
  backToTop?.classList.toggle('visible', currentScrollY > 400);
}

window.addEventListener('scroll', handleScrollEffects, { passive: true });

// Ejecución inicial preventiva por si el navegador restaura la posición
// de scroll tras una recarga de página (F5 / Ctrl+R).
handleScrollEffects();

// Desplazamiento suave al tope mediante la API nativa de window.scrollTo
backToTop?.addEventListener('click', () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});


// ─── 3. SECCIÓN ACTIVA EN EL NAV (IntersectionObserver API) ──
//
// PROBLEMA A RESOLVER:
// Iluminar el enlace del menú correspondiente a la sección que el
// usuario está leyendo en ese momento.
//
// POR QUÉ NO USAMOS EL EVENTO 'scroll' TRADICIONAL:
// Escuchar 'scroll' ejecuta cálculos matemáticos pesados decenas de
// veces por segundo en el hilo principal (Main Thread), degradando
// la fluidez en dispositivos móviles.
//
// SOLUCIÓN PROFESIONAL:
// Usamos IntersectionObserver, una API nativa asíncrona del navegador
// que corre fuera del hilo principal y notifica únicamente cuando un
// elemento entra o sale del viewport según los umbrales configurados.

const navLinks = document.querySelectorAll('.nx-nav-link[data-section]');
const sections = document.querySelectorAll('section[id]');

// Configuración de la ventana de detección:
// 'rootMargin: -25% 0px -65% 0px' define una franja activa en el tercio
// superior de la pantalla. Una sección solo se considera "activa" cuando
// su encabezado ingresa en esa zona delimitada.
const observerConfig = {
  root: null, // Viewport del navegador
  rootMargin: '-25% 0px -65% 0px',
  threshold: 0
};

const navSectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // 1. Removemos la clase de resaltado de todos los links
      navLinks.forEach(link => link.classList.remove('active'));

      // 2. Localizamos el enlace cuyo atributo 'data-section' coincide con el id
      const activeSectionId = entry.target.id;
      const matchedLink = document.querySelector(
        `.nx-nav-link[data-section="${activeSectionId}"]`
      );

      // 3. Activamos el enlace correspondiente (dispara el subrayado cian)
      if (matchedLink) {
        matchedLink.classList.add('active');
      }
    }
  });
}, observerConfig);

// Ponemos en observación a todas las secciones con ID
sections.forEach(section => navSectionObserver.observe(section));


// ─── 4. CALCULADOR INTERACTIVO DE PUESTOS (SIMULADOR) ────────
//
// CASO PEDAGÓGICO:
// Demuestra el manejo del DOM y la implementación de reglas de
// negocio reactivas en el cliente antes de conectarlas con el backend.
//
// REGLA DE NEGOCIO IMPLEMENTADA:
// - Precio base según tipo de máquina (leído dinámicamente desde 'data-price').
// - Descuento progresivo por cantidad de horas reservadas:
//     * 2 horas  -> 10% de descuento
//     * 4 horas  -> 20% de descuento (Media jornada)
//     * 8 horas  -> 35% de descuento (Pase Nocturno All-Night)
//
// GUÍA DE INTEGRACIÓN BACKEND (SPRINT 2):
// En la etapa con FastAPI, este cálculo se complementará enviando los
// parámetros elegidos al endpoint:
// POST /api/reservas/cotizar  ->  { "setup_type": "pc", "hours": 4 }
// Recibiendo como respuesta el desglose impositivo y el token de pago.

const setupType      = document.getElementById('setupType');
const setupHours     = document.getElementById('setupHours');
const calcTotal      = document.getElementById('calcTotal');
const btnReservarSim = document.getElementById('btnReservarSim');
const simMessage     = document.getElementById('simMessage');

function recalcularTarifa() {
  if (!setupType || !setupHours || !calcTotal) return;

  // Obtenemos la opción seleccionada y extraemos su metadata
  const selectedOption = setupType.options[setupType.selectedIndex];
  const valorHoraBase  = parseInt(selectedOption.getAttribute('data-price') || '4500', 10);
  const horasElegidas  = parseInt(setupHours.value, 10);

  // Aplicamos matriz de descuentos comerciales
  let factorDescuento = 1.0;
  if (horasElegidas === 2) {
    factorDescuento = 0.90;
  } else if (horasElegidas === 4) {
    factorDescuento = 0.80;
  } else if (horasElegidas === 8) {
    factorDescuento = 0.65;
  }

  // Cálculo final redondeado y formateado a moneda local argentina
  const totalCalculado = Math.round(valorHoraBase * horasElegidas * factorDescuento);
  calcTotal.textContent = `$${totalCalculado.toLocaleString('es-AR')}`;
}

// Escuchamos los cambios en ambos selectores para actualizar en vivo
setupType?.addEventListener('change', recalcularTarifa);
setupHours?.addEventListener('change', recalcularTarifa);

// Llamada de inicialización para renderizar el valor por defecto
recalcularTarifa();

btnReservarSim?.addEventListener('click', () => {
  if (!simMessage) return;

  // Feedback temporal de simulación
  simMessage.textContent = '✓ Configuración guardada. En el próximo hito este botón derivará a la pasarela de pagos en FastAPI.';
  
  setTimeout(() => {
    simMessage.textContent = '';
  }, 4500);
});


// ─── 5. CONSULTA DE PASE / RIG EN TIEMPO REAL (GET BY ID) ────
//
// MODELO DE NEGOCIO: "Consulta pública sin autenticación"
//
// A diferencia de un panel privado con login, este módulo permite
// que un jugador o espectador consulte el estado operativo de su
// puesto o equipo usando un código identificador alfanumérico.
//
// GUÍA DE INTEGRACIÓN BACKEND (SPRINT 2):
// Los alumnos deberán reemplazar el objeto mock 'DEMO_PASES' por una
// llamada fetch asíncrona real hacia el router de FastAPI:
//
// try {
//   const response = await fetch(`/api/puestos/${codigoPase}`);
//   if (!response.ok) throw new Error("Pase no encontrado");
//   const data = await response.json();
//   renderizarResultado(data);
// } catch (error) {
//   renderizarError(error.message);
// }

const trackingInput     = document.getElementById('trackingInput');
const btnTracking       = document.getElementById('btnTracking');
const trackingResultado = document.getElementById('trackingResultado');

// Dataset simulado para desarrollo frontend
const DEMO_PASES = {
  'NX-9081': {
    rig: 'RIG #14 (RTX 4080 Super)',
    estado: 'LISTO PARA INGRESAR',
    horario: '19:00 a 23:00 hs',
    pin: '8821',
    pasoActual: 2
  },
  'NX-4022': {
    rig: 'SIMULADOR #02 (Cockpit Fanatec)',
    estado: 'SESIÓN EN CURSO',
    horario: '17:30 a 19:30 hs',
    pin: '4190',
    pasoActual: 3
  },
  'NX-1004': {
    rig: 'CABINA STREAM #01',
    estado: 'PASE FINALIZADO',
    horario: '14:00 a 17:00 hs',
    pin: '----',
    pasoActual: 3
  }
};

function procesarConsultaPase() {
  if (!trackingInput || !trackingResultado) return;

  const codigo = trackingInput.value.trim().toUpperCase();

  // Validación 1: Campo vacío o longitud insuficiente
  if (!codigo || codigo.length < 4) {
    trackingResultado.innerHTML = `
      <div class="alert alert-danger p-2 small mt-2" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i> Ingresá un código de pase válido (Ej: NX-9081).
      </div>
    `;
    return;
  }

  // Estado de carga (Loading State) para simular la latencia de red
  trackingResultado.innerHTML = `
    <div class="text-center py-3">
      <div class="spinner-border spinner-border-sm text-info" role="status"></div>
      <span class="small text-muted ms-2">Consultando disponibilidad en la Arena...</span>
    </div>
  `;

  // Simulamos delay de respuesta del servidor (600 ms)
  setTimeout(() => {
    // Si el código existe en el mock usamos sus datos, sino generamos un estado estándar
    const infoPase = DEMO_PASES[codigo] || {
      rig: 'RIG #08 (Competitivo)',
      estado: 'CONFIRMADO EN COLA',
      horario: 'Turno programado para hoy',
      pin: '5532',
      pasoActual: 1
    };

    // Renderizamos la tarjeta de trazabilidad visual
    trackingResultado.innerHTML = `
      <div class="nx-track-card mt-3">
        <div class="nx-track-header">
          <span class="nx-track-code">${codigo} · ${infoPase.rig}</span>
          <span class="nx-track-badge">${infoPase.estado}</span>
        </div>
        <p class="small mb-1 text-light">
          <strong>Horario:</strong> ${infoPase.horario} | 
          <strong>PIN de Activación:</strong> <span class="text-info">${infoPase.pin}</span>
        </p>
        
        <!-- Línea de tiempo interactiva según el estado -->
        <div class="nx-timeline mt-3">
          <div class="nx-step ${infoPase.pasoActual >= 1 ? 'completed' : ''}">
            <div class="nx-step-dot"></div>Reserva
          </div>
          <div class="nx-step ${infoPase.pasoActual >= 2 ? 'completed' : ''}">
            <div class="nx-step-dot"></div>Puesto Asignado
          </div>
          <div class="nx-step ${infoPase.pasoActual >= 3 ? 'completed' : ''}">
            <div class="nx-step-dot"></div>En Juego
          </div>
        </div>
      </div>
    `;
  }, 600);
}

btnTracking?.addEventListener('click', procesarConsultaPase);

// Habilitamos la consulta directa presionando la tecla Enter en el input
trackingInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    procesarConsultaPase();
  }
});


// ─── 6. FORMULARIO DE CONTACTO (HTML5 Constraint Validation) ──
//
// BUENAS PRÁCTICAS:
// Se utiliza la Constraint Validation API nativa del navegador.
// Al usar 'novalidate' en el HTML desactivamos los tooltips genéricos
// por defecto y controlamos la lógica mediante 'checkValidity()'
// y 'reportValidity()'.
//
// GUÍA DE INTEGRACIÓN BACKEND (SPRINT 2):
// Para enviar la información a FastAPI, se deberá transformar el
// formulario a formato JSON y enviarlo mediante una petición HTTP POST:
//
// const formData = new FormData(contactForm);
// const payload  = Object.fromEntries(formData.entries());
// const response = await fetch('/api/contacto', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify(payload)
// });

const contactForm = document.getElementById('contactForm');
const formMessage = document.getElementById('formMessage');

contactForm?.addEventListener('submit', (event) => {
  // Prevenimos el envío tradicional con recarga de página
  event.preventDefault();

  // Validamos si todos los campos cumplen con los requisitos (required, minlength, type="email")
  if (!contactForm.checkValidity()) {
    contactForm.reportValidity();
    return;
  }

  // Notificación de éxito en el DOM
  if (formMessage) {
    formMessage.textContent = '✓ Consulta registrada con éxito. En la etapa de backend se enviará al router de FastAPI.';
  }

  // Limpiamos los campos tras el envío satisfactorio
  contactForm.reset();

  // Ocultamos el mensaje de confirmación tras 5 segundos
  setTimeout(() => {
    if (formMessage) formMessage.textContent = '';
  }, 5000);
});