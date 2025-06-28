# ECN Platform

Esta aplicación fue generada usando [Angular CLI](https://github.com/angular/angular-cli) versión 20.0.3.

## Configuración de Google Auth

### 1. Configurar dominios autorizados en Firebase

Para que el login con Google funcione correctamente, necesitas configurar los dominios autorizados en Firebase:

1. Ve a la [Consola de Firebase](https://console.firebase.google.com/)
2. Selecciona tu proyecto `ecn-platform`
3. Ve a **Authentication** > **Settings** > **Authorized domains**
4. Agrega los siguientes dominios:
   - `localhost` (para desarrollo)
   - `ecn-platform.firebaseapp.com` (tu dominio de Firebase)
   - Cualquier otro dominio donde despliegues la aplicación

### 2. Configurar proveedores de autenticación

1. En Firebase Console, ve a **Authentication** > **Sign-in method**
2. Habilita **Google** como proveedor
3. Configura el **Project support email**
4. Guarda los cambios

## Development server

Para iniciar el servidor de desarrollo local, ejecuta:

```bash
ng serve
```

Una vez que el servidor esté ejecutándose, abre tu navegador y navega a `http://localhost:4200/`. La aplicación se recargará automáticamente cuando modifiques cualquier archivo fuente.

## Code scaffolding

Angular CLI incluye herramientas poderosas de scaffolding de código. Para generar un nuevo componente, ejecuta:

```bash
ng generate component component-name
```

Para una lista completa de esquemas disponibles (como `components`, `directives`, o `pipes`), ejecuta:

```bash
ng generate --help
```

## Building

Para construir el proyecto ejecuta:

```bash
ng build
```

Esto compilará tu proyecto y almacenará los artefactos de build en el directorio `dist/`. Por defecto, el build de producción optimiza tu aplicación para rendimiento y velocidad.

## Deployment

Para desplegar en Firebase Hosting:

```bash
# Construir la aplicación
ng build

# Desplegar en Firebase
firebase deploy
```

## Running unit tests

Para ejecutar las pruebas unitarias con el test runner [Karma](https://karma-runner.github.io), usa el siguiente comando:

```bash
ng test
```

## Running end-to-end tests

Para pruebas end-to-end (e2e), ejecuta:

```bash
ng e2e
```

Angular CLI no viene con un framework de testing end-to-end por defecto. Puedes elegir uno que se adapte a tus necesidades.

## Estructura del Proyecto

- `src/app/core/services/auth.service.ts` - Servicio de autenticación con Google
- `src/app/core/guards/auth.guard.ts` - Guard para proteger rutas
- `src/app/pages/login/` - Componente de login con Google
- `firebase.json` - Configuración de Firebase Hosting
- `.firebaserc` - Configuración del proyecto de Firebase

## Additional Resources

Para más información sobre el uso de Angular CLI, incluyendo referencias detalladas de comandos, visita la página [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli).
