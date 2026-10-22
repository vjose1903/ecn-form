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

Los datos de la pareja se dividen por secciones (`couple_basic`, `contact`, `identity`, `family`, `relationship`, entre otras). Cada sección vive en `details/{sectionId}` y los roles reciben permisos de lectura/creación/edición por sección. El catálogo de secciones permitido lo define la plataforma; los roles pueden combinarlo sin desplegar código.

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

- `city/{cityId}/members/{uid}` indica la membresía activa y su `role_id`.
- `city/{cityId}/roles/{roleId}` contiene las acciones y grupos de campos permitidos.
- Las reglas deniegan por defecto, restringen cada lectura a la ciudad y separan permisos de listado, lectura y escritura.
- Los cambios de cuenta y rol pasan por Cloud Functions. Los cambios de documentos de ciudad generan eventos de auditoría con actor, hora de servidor, ruta y diferencias anteriores/nuevas.
- Los registros de auditoría no son editables por clientes. Las identidades `service_account` deben incluir el actor original en el evento de negocio cuando la operación venga del backend.
