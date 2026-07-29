// Credenciales de relleno para que los tests puedan IMPORTAR los módulos.
//
// Varios módulos validan sus credenciales al cargarse, no al usarse. Eso está
// bien en producción —arrancar sin base de datos es un error que conviene ver
// de inmediato— pero en los tests hacía que el archivo entero fallara en el
// import, antes de ejecutar una sola prueba. El resultado es que la lógica de
// prompts de portadas, historias y YouTube llevaba tiempo sin ninguna prueba
// corriendo, y nadie lo notaba porque el fallo se leía como "faltan variables
// de entorno" y no como "estos tests no existen".
//
// Los valores son deliberadamente falsos y no se usan para hablar con nadie:
// los tests que los necesitarían de verdad simulan la red por su cuenta.

const RELLENO: Record<string, string> = {
  DATABASE_URL: "postgres://tests:tests@127.0.0.1:5432/tests",
  AI_INTEGRATIONS_OPENAI_API_KEY: "sk-tests-no-se-usa",
};

for (const [clave, valor] of Object.entries(RELLENO)) {
  if (!process.env[clave]) process.env[clave] = valor;
}
