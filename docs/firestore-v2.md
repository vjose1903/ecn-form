# Firestore v2: estructura, permisos e identificadores

## Colecciones

```text
city/{cityId}
  members/{uid}
  roles/{roleId}
  retreat_homes/{homeId}                 # asignación a la casa global
  retreat/{retreatId}
  requests/{requestId}                    # datos resumidos; incluye retreat_id actual
    details/{sectionId}                   # grupos de datos protegidos por campo
    payments/{paymentId}
    history/{eventId}
  audit_logs/{auditId}

user/{uid}                                # perfil global, UID de Firebase Auth
retreat_home/{homeId}                     # catálogo global reutilizable
global_audit_logs/{auditId}
```

Una solicitud mantiene el mismo ID aunque se transfiera a otro retiro. La transferencia actualiza `retreat_id`; pagos e historial permanecen bajo el registro estable. Las consultas por retiro usan `where('retreat_id', '==', retreatId)` y paginación.

Los datos de la pareja se dividen por secciones (`couple_basic`, `contact`, `identity`, `family`, `relationship`, entre otras). Cada sección vive en `details/{sectionId}` y los roles reciben permisos de lectura y edición por sección. Las solicitudes solo se crean mediante el formulario público dedicado de las parejas, cuyas funciones callable no requieren sesión y guardan los datos con Admin SDK; la plataforma administrativa no otorga permisos de creación y las reglas de Firestore bloquean escrituras directas de creación. El estado de la solicitud (`status`: pendiente, aceptada o rechazada) y el indicador de información (`is_informado`) usan permisos independientes (`status` e `informed`). Como los registros existentes guardan ambos en `details/status`, el callable `getRequestFieldGroups` devuelve únicamente los campos autorizados; el cliente no puede leer directamente esos documentos. Los cambios de `is_informado` nuevos se guardan en `details/informed`, y la lectura mantiene compatibilidad con el valor antiguo sin volver a ejecutar la migración.

## Identificadores de documentos

- Ciudades: nombre normalizado (`santo_domingo_norte`).
- Retiros: `{numero}_{fecha-inicio}_{fecha-fin}`, por ejemplo `84_2026-10-30_2026-11-01`.
- Solicitudes: `sol_{numero-retiro}_{AAAAMMDD}_{sufijo}`, por ejemplo `sol_84_20261022_k7f3n2`. Se conserva al transferir.
- Pagos: `pago_{AAAAMMDD}_{monto}_{sufijo}`, por ejemplo `pago_20261022_4000_a1b2c3`, vinculados a la solicitud.
- Historial: `hist_{AAAAMMDD}_{accion}_{sufijo}`, por ejemplo `hist_20261022_pago_k7f3n2`.
- Auditoría: `aud_{UTC}_{tipo}_{accion}_{id-evento}`; el ID de evento mantiene idempotencia.
- Roles: slug normalizado, como `captura_pagos`.
- Miembros y perfil global: UID de Firebase Auth como ID, para resolver acceso de forma directa y evitar duplicar cuentas.
- Casas de retiro: nombre normalizado y un sufijo corto si hay nombres duplicados, por ejemplo `casa_san_jose`.
- Asignación de casa a ciudad: mismo `homeId` del catálogo global, para identificar la relación sin copiar la ficha.

Los IDs incluyen datos operativos reconocibles, como el número de retiro, fechas, tipo de documento y monto; nunca incluyen nombres ni otros datos personales. Así el ID no filtra campos que un rol tenga restringido. Los IDs se completan con un sufijo aleatorio para evitar colisiones. Los documentos raíz de solicitudes contienen solo campos operativos necesarios para indexar y filtrar; nombres y montos se guardan en grupos separados con permisos propios.

## Permisos y auditoría

- `city/{cityId}/members/{uid}` indica la membresía activa y su `role_id`. Cualquier miembro activo puede leer los datos básicos de su propia ciudad; las ciudades y su administración siguen reservadas al superadmin. La lectura de la ciudad no es un permiso configurable del rol.
- `city/{cityId}/roles/{roleId}` contiene las acciones y grupos de campos permitidos; cada miembro activo puede consultar únicamente el rol que tiene asignado para resolver qué opciones mostrar en el menú.
- `permissions.dashboard` contiene permisos independientes para cada KPI y gráfico del dashboard. La interfaz solo calcula y muestra las secciones autorizadas; los roles existentes se inicializan con todas las secciones habilitadas y los roles predeterminados de ciudades nuevas también reciben todas.
- La administración de ciudades está reservada al superadmin. Al crear una ciudad, el callable `saveCity` copia atómicamente desde La Vega los roles `city_admin`, `operador` y `consulta`, incluyendo sus permisos; al `operador` de la nueva ciudad le activa además `retreats.create`, las acciones de archivar/restaurar/transferir solicitudes, las acciones de historial y la edición de todas las secciones de solicitudes. Esta configuración solo se aplica al crear ciudades y no modifica los roles existentes de La Vega. Una edición solo modifica los datos descriptivos de la ciudad.
- Consultar una entidad relacionada por el ID guardado en una entidad que el usuario puede leer es una lectura puntual y de solo lectura; no concede acceso al listado ni a la edición de la entidad relacionada. Por ejemplo, un retiro puede mostrar el nombre de su casa enlazada aunque el rol no pueda administrar el catálogo.
- En formularios, si falta permiso para listar una entidad relacionada, se conserva visible la relación ya guardada y su selector queda bloqueado con un aviso; no se debe borrar ni sustituir el valor al guardar otros campos. Las acciones que requieren elegir otra entidad quedan bloqueadas hasta que el usuario pueda consultar sus opciones.
- En casas de retiro, `retreat_homes.assign` habilita asignar al usuario autenticado y `retreat_homes.unassign` habilita desasignar; los miembros quedan limitados a su ciudad activa y las reglas de Firestore validan cada operación. El superadmin conserva la administración entre ciudades.
- Las imágenes de las casas de retiro se administran con `retreat_homes.create` o `retreat_homes.update`; no existe un recurso independiente `files` para los roles. Los recibos de pagos se rigen por los permisos de `payments`.
- Las reglas deniegan por defecto, restringen cada lectura a la ciudad y separan permisos de listado, lectura y escritura.
- Los cambios de cuenta y rol pasan por Cloud Functions. Los cambios de documentos de ciudad generan eventos de auditoría con actor, hora de servidor, ruta y diferencias anteriores/nuevas.
- Los registros de auditoría no son editables por clientes. Las identidades `service_account` deben incluir el actor original en el evento de negocio cuando la operación venga del backend.
