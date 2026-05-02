export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Política de Privacidad</h1>
          <p className="text-muted-foreground">Última actualización: 16 de marzo de 2026</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Introducción</h2>
            <p>
              WebMakerChile ("nosotros", "nuestro") opera la plataforma de gestión de contenido disponible en admin.webmakerlatam.com ("el Servicio"). Esta Política de Privacidad explica cómo recopilamos, usamos, almacenamos y protegemos su información personal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Información que Recopilamos</h2>
            <p>Recopilamos los siguientes tipos de información:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                <strong className="text-foreground">Información de cuenta de Google:</strong> Al iniciar sesión con Google OAuth, recibimos su nombre, dirección de correo electrónico y foto de perfil.
              </li>
              <li>
                <strong className="text-foreground">Tokens de acceso:</strong> Almacenamos tokens de acceso y actualización de Google para permitir la integración con YouTube y Google Drive en su nombre. Estos tokens se almacenan de forma segura en nuestra base de datos.
              </li>
              <li>
                <strong className="text-foreground">Contenido creado:</strong> Videos, imágenes de portada, descripciones y otros contenidos que usted crea dentro del Servicio.
              </li>
              <li>
                <strong className="text-foreground">Datos de uso:</strong> Información sobre cómo utiliza el Servicio, incluyendo ideas generadas, videos programados y publicaciones realizadas.
              </li>
              <li>
                <strong className="text-foreground">Información de TikTok:</strong> Al conectar su cuenta de TikTok, podemos acceder a información básica de su perfil y publicar contenido en su nombre según los permisos otorgados.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Cómo Usamos su Información</h2>
            <p>Utilizamos su información para:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Autenticar su identidad y gestionar el acceso al Servicio.</li>
              <li>Publicar contenido en TikTok, Instagram, YouTube y Google Drive en su nombre.</li>
              <li>Generar contenido con inteligencia artificial (ideas, portadas, descripciones).</li>
              <li>Programar y automatizar la publicación de videos.</li>
              <li>Mejorar y mantener la funcionalidad del Servicio.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Compartición de Datos</h2>
            <p>
              No vendemos ni compartimos su información personal con terceros, excepto en los siguientes casos:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong className="text-foreground">Plataformas de redes sociales:</strong> Compartimos su contenido con TikTok, Instagram y YouTube exclusivamente cuando usted programa o publica contenido a través del Servicio.</li>
              <li><strong className="text-foreground">Google Drive:</strong> Almacenamos archivos en su Google Drive según sus instrucciones.</li>
              <li><strong className="text-foreground">Proveedores de IA:</strong> Enviamos prompts de texto a servicios de inteligencia artificial para generar contenido. No se envía información personal identificable.</li>
              <li><strong className="text-foreground">Requerimientos legales:</strong> Podemos divulgar información si es requerido por ley.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Almacenamiento y Seguridad</h2>
            <p>
              Su información se almacena en servidores seguros. Los tokens de acceso a plataformas de terceros se almacenan en nuestra base de datos con medidas de seguridad apropiadas. Utilizamos conexiones HTTPS cifradas para todas las comunicaciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Retención de Datos</h2>
            <p>
              Conservamos su información mientras su cuenta esté activa. Puede solicitar la eliminación de su cuenta y datos asociados en cualquier momento contactándonos por correo electrónico. Los tokens de acceso se invalidan cuando cierra sesión.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Sus Derechos</h2>
            <p>Usted tiene derecho a:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Acceder a los datos personales que tenemos sobre usted.</li>
              <li>Solicitar la corrección de datos inexactos.</li>
              <li>Solicitar la eliminación de sus datos.</li>
              <li>Revocar el acceso a sus cuentas de redes sociales en cualquier momento desde la configuración de cada plataforma.</li>
              <li>Retirar su consentimiento para el procesamiento de datos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Cookies y Sesiones</h2>
            <p>
              Utilizamos cookies de sesión para mantener su autenticación. Estas cookies son esenciales para el funcionamiento del Servicio y expiran después de 7 días de inactividad. No utilizamos cookies de seguimiento ni publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Integración con TikTok</h2>
            <p>
              Cuando conecta su cuenta de TikTok con nuestro Servicio, accedemos a los siguientes datos según los permisos que usted otorgue:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Información básica del perfil de TikTok.</li>
              <li>Capacidad de publicar videos en su cuenta de TikTok.</li>
            </ul>
            <p className="mt-2">
              Puede revocar el acceso de nuestra aplicación a su cuenta de TikTok en cualquier momento desde la configuración de TikTok → Seguridad y permisos → Gestionar permisos de apps.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Menores de Edad</h2>
            <p>
              El Servicio no está dirigido a menores de 18 años. No recopilamos intencionalmente información de menores de edad.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Cambios a esta Política</h2>
            <p>
              Podemos actualizar esta Política de Privacidad periódicamente. Los cambios serán publicados en esta página con una fecha de actualización revisada.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">12. Contacto</h2>
            <p>
              Para consultas sobre esta Política de Privacidad o para ejercer sus derechos, contacte a: <a href="mailto:webmakerchile@gmail.com" className="text-primary hover:underline">webmakerchile@gmail.com</a>
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-center text-xs text-muted-foreground">
          © 2026 WebMakerChile. Todos los derechos reservados.
        </div>
      </div>
    </div>
  );
}
