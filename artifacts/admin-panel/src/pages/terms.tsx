export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Términos de Servicio</h1>
          <p className="text-muted-foreground">Última actualización: 22 de mayo de 2026</p>
          <p className="text-muted-foreground mt-2">Aplicable a la aplicación <strong className="text-foreground">WebMaker Latam</strong> disponible en admin.webmakerlatam.com.</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Aceptación de los Términos</h2>
            <p>
              Al acceder y utilizar <strong className="text-foreground">WebMaker Latam</strong> ("WebMaker Latam", "el Servicio", "nosotros" o "nuestro"), disponible en admin.webmakerlatam.com, usted acepta estar sujeto a estos Términos de Servicio. Si no está de acuerdo con estos términos, no utilice WebMaker Latam.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Descripción del Servicio</h2>
            <p>
              <strong className="text-foreground">WebMaker Latam</strong> es una plataforma de gestión de contenido que permite a los usuarios crear, programar y publicar videos en plataformas de redes sociales, incluyendo TikTok, Instagram, YouTube, LinkedIn, X y Facebook. WebMaker Latam incluye herramientas de generación de contenido con inteligencia artificial, gestión de archivos multimedia y automatización de publicaciones. La integración con TikTok se realiza mediante Login Kit (scope <strong className="text-foreground">user.info.basic</strong>) y Content Posting API (scope <strong className="text-foreground">video.upload</strong>), permitiendo a WebMaker Latam subir videos como borradores a la cuenta de TikTok del usuario para que éste los revise y publique desde la app oficial de TikTok.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Cuentas de Usuario</h2>
            <p>
              Para utilizar el Servicio, debe autenticarse mediante Google OAuth. Usted es responsable de mantener la seguridad de su cuenta y de todas las actividades que ocurran bajo su sesión. Solo los usuarios autorizados previamente pueden acceder al panel de administración.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Uso Aceptable</h2>
            <p>Usted se compromete a:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Utilizar el Servicio únicamente para fines legítimos de gestión de contenido.</li>
              <li>No publicar contenido que viole las leyes aplicables, derechos de terceros o las políticas de las plataformas de destino (TikTok, Instagram, YouTube).</li>
              <li>No intentar acceder a funciones o datos no autorizados del Servicio.</li>
              <li>Cumplir con los términos de servicio de cada plataforma de redes sociales conectada.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Contenido del Usuario</h2>
            <p>
              Usted conserva la propiedad de todo el contenido que crea o sube a través del Servicio. Al utilizar nuestras herramientas de publicación, nos otorga permiso para transmitir su contenido a las plataformas de destino seleccionadas en su nombre.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Integraciones de Terceros</h2>
            <p>
              El Servicio se conecta con plataformas de terceros (TikTok, Instagram, YouTube, Google Drive) mediante sus APIs oficiales. El uso de estas integraciones está sujeto a los términos de servicio de cada plataforma respectiva. No somos responsables de cambios, interrupciones o limitaciones impuestas por estos servicios de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Inteligencia Artificial</h2>
            <p>
              El Servicio utiliza modelos de inteligencia artificial para generar ideas de contenido, imágenes de portada y sugerencias. El contenido generado por IA es proporcionado "tal cual" y usted es responsable de revisarlo antes de publicarlo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Limitación de Responsabilidad</h2>
            <p>
              El Servicio se proporciona "tal cual" sin garantías de ningún tipo. No seremos responsables por daños directos, indirectos, incidentales o consecuentes derivados del uso del Servicio, incluyendo pero no limitado a pérdida de datos, interrupciones del servicio o errores en la publicación de contenido.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Modificaciones</h2>
            <p>
              Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán efectivos inmediatamente después de su publicación en esta página. El uso continuado del Servicio después de los cambios constituye su aceptación de los términos modificados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Contacto</h2>
            <p>
              Para consultas sobre estos Términos de Servicio, contacte a: <a href="mailto:webmakerlatam@gmail.com" className="text-primary hover:underline">webmakerlatam@gmail.com</a>
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-foreground/15 text-center text-xs text-muted-foreground">
          © 2026 WebMaker Latam. Todos los derechos reservados.
        </div>
      </div>
    </div>
  );
}
