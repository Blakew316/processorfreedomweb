/* The legal pages in Spanish, for sites set to Español. Same content as the English pages in core.js. */
export function legalEs(kind, site, str) {
  const b = site.business || {};
  const name = site.brand?.name || 'Este negocio';
  const legal = str(b.legalName).trim() || name;
  const where = [b.address1, b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const reach = [b.email && `escribirnos a ${b.email}`, b.phone && `llamarnos al ${b.phone}`, where && `escribir a ${legal}, ${where}`].filter(Boolean);
  const contactLine = reach.length ? `Puedes ${reach.join(', o ')}.` : 'Puedes comunicarte con nosotros mediante el formulario de contacto de este sitio web.';
  const state = str(b.state).trim();

  if (kind === 'privacy') return `${legal} ("${name}", "nosotros") respeta tu privacidad. Esta política explica qué información recopilamos a través de este sitio web, cómo la usamos y qué opciones tienes.

## Información que recopilamos
- Información que nos das, como tu nombre, correo electrónico, número de teléfono y el contenido de cualquier mensaje que envíes con nuestro formulario de contacto.
- Información que se recopila automáticamente, como el tipo de navegador, el tipo de dispositivo, las páginas visitadas y la ubicación aproximada que se deriva de tu dirección IP.
- Información de pago. Los pagos los procesa un procesador de pagos que cumple con PCI DSS. No guardamos números de tarjeta completos ni códigos de seguridad en nuestros sistemas.

## Cómo usamos la información
- Para responder a tus preguntas y solicitudes.
- Para ofrecer, programar y cobrar nuestros productos y servicios.
- Para operar, proteger y mejorar este sitio web.
- Para enviarte avisos relacionados con el servicio. Solo enviamos mensajes de marketing cuando aceptaste recibirlos, y puedes darte de baja en cualquier momento.
- Para cumplir con la ley y proteger nuestros derechos.

## Cómo compartimos la información
No vendemos tu información personal. Solo la compartimos con proveedores que nos ayudan a operar el negocio, como el alojamiento del sitio web, el procesamiento de pagos y el envío de correos, y solo en la medida necesaria para prestar esos servicios. También podemos divulgarla cuando la ley lo exija, o en relación con la venta o reorganización de nuestro negocio.

## Cookies
Este sitio web usa solo las cookies y tecnologías similares necesarias para funcionar y para entender de forma agregada cómo se usa. Puedes bloquear las cookies en la configuración de tu navegador; si lo haces, algunas funciones podrían no funcionar como se espera.

## Conservación y seguridad de los datos
Conservamos la información personal solo durante el tiempo necesario para los fines descritos o el que exija la ley. Usamos medidas administrativas, técnicas y físicas razonables para protegerla. Ningún método de transmisión o almacenamiento es completamente seguro.

## Tus opciones y derechos
Según dónde vivas, puedes tener derecho a solicitar el acceso, la corrección o la eliminación de tu información personal, y a oponerte a ciertos usos. Para hacer una solicitud, comunícate con nosotros con los datos de abajo. No te discriminaremos por ejercer estos derechos.

## Menores
Este sitio web no está dirigido a menores de 13 años, y no recopilamos a sabiendas información personal de ellos.

## Cambios a esta política
Podemos actualizar esta política de vez en cuando. La fecha de vigencia de abajo indica cuándo se revisó por última vez.

## Contáctanos
¿Tienes preguntas sobre esta política? ${contactLine}`;

  if (kind === 'terms') return `Estos términos rigen el uso de este sitio web, operado por ${legal} ("${name}", "nosotros"). Al usar el sitio web aceptas estos términos. Si no estás de acuerdo, no uses el sitio web.

## Uso de este sitio web
Puedes usar este sitio web solo con fines legales. Te comprometes a no interferir con su funcionamiento, no intentar acceder a él sin autorización y no usarlo para transmitir material dañino o ilegal.

## Productos, servicios y precios
Hacemos todo lo posible por describir nuestros productos, servicios y precios con exactitud. Las descripciones, la disponibilidad y los precios pueden cambiar sin previo aviso, y nos reservamos el derecho de corregir errores. Todo presupuesto, reserva o pedido está sujeto a nuestra confirmación.

## Pagos
Los pagos los procesa de forma segura un procesador de pagos externo. Al enviar tu información de pago confirmas que estás autorizado para usar ese método de pago. Los reembolsos y las cancelaciones se manejan según la política comunicada en el momento de la compra.

## Propiedad intelectual
El contenido de este sitio web, incluidos los textos, las imágenes, los logotipos y el diseño, pertenece a ${legal} o a sus licenciantes y está protegido por la ley. No puedes copiarlo ni reutilizarlo sin nuestro permiso por escrito.

## Enlaces de terceros
Este sitio web puede incluir enlaces a sitios que no controlamos. No somos responsables de su contenido ni de sus prácticas.

## Exención de garantías
Este sitio web se ofrece "tal cual" y "según disponibilidad". En la máxima medida permitida por la ley, renunciamos a toda garantía, expresa o implícita, incluidas las garantías de comerciabilidad, idoneidad para un fin determinado y no infracción.

## Limitación de responsabilidad
En la máxima medida permitida por la ley, ${legal} no será responsable de ningún daño indirecto, incidental, especial o consecuente que resulte del uso de este sitio web.

## Ley aplicable
Estos términos se rigen por las leyes ${state ? `del estado de ${state}` : 'del estado en el que operamos'}, sin tener en cuenta sus normas sobre conflictos de leyes.

## Cambios a estos términos
Podemos actualizar estos términos de vez en cuando. Si sigues usando el sitio web después de que se publiquen los cambios, aceptas los términos revisados.

## Contáctanos
¿Tienes preguntas sobre estos términos? ${contactLine}`;

  if (kind === 'policies') return `Estas políticas explican cómo ${name} maneja los pedidos, los pagos, las cancelaciones y los reembolsos. Si algo no está claro, pregúntanos antes de comprar o reservar.

## Pedidos y reservas
Los pedidos y las citas quedan confirmados cuando recibes nuestra confirmación. Si no podemos cumplir una solicitud, te avisaremos pronto y te reembolsaremos cualquier monto ya pagado.

## Pagos
Aceptamos Visa, Mastercard, American Express y Discover. Salvo que hayamos acordado otra cosa, pagas al recoger o recibir tu pedido, o en línea mediante nuestro enlace de pago cuando lo ofrecemos. Los precios se muestran en dólares estadounidenses y pueden estar sujetos a los impuestos aplicables.

## Cancelaciones y cambios
Avísanos con la mayor anticipación posible si necesitas cancelar o cambiar una reserva. Pedimos al menos 24 horas de aviso para citas y reservaciones. Las cancelaciones tardías y las citas a las que no se asiste pueden tener un cargo.

## Devoluciones y reembolsos
Si no estás satisfecho con una compra, comunícate con nosotros dentro de los 30 días y buscaremos una solución. Los reembolsos aprobados se devuelven al método de pago original, por lo general en un plazo de 5 a 10 días hábiles. Los artículos personalizados, perecederos y de venta final no admiten devolución, salvo que lleguen dañados o defectuosos.

## Recogida y entrega
Cuando ofrecemos recogida o entrega, los tiempos estimados se dan de buena fe y pueden variar. Revisa tu pedido al recibirlo y avísanos de inmediato si hay algún problema.

## Contáctanos
¿Tienes preguntas sobre un pedido o sobre estas políticas? ${contactLine}`;

  return `${name} se compromete a que este sitio web pueda usarlo cualquier persona, incluidas las personas con discapacidad.

## Nuestro estándar
Buscamos cumplir con las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.1, nivel AA. Este sitio web está hecho con texto legible, contraste de color suficiente, navegación accesible con el teclado y diseños que se adaptan a cualquier tamaño de pantalla y nivel de zoom.

## Un esfuerzo continuo
La accesibilidad es un esfuerzo continuo. Revisamos este sitio web con regularidad y trabajamos para resolver los problemas a medida que los encontramos.

## Comentarios
Si tienes dificultades para usar alguna parte de este sitio web, o necesitas la información en otro formato, avísanos y haremos lo posible por ayudarte. ${contactLine}`;
}
