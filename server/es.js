/* What a Spanish site's customers read when an order, booking or message cannot be sent.
   Each English message the public pages can get back, with its Spanish version. Anything not listed stays as it is. */
const EXACT = new Map([
  ['Choose how you would like to receive your order.', 'Elige cómo quieres recibir tu pedido.'],
  ['Please add your delivery address.', 'Agrega tu dirección de entrega.'],
  ['Please add your name, phone number and a valid email address.', 'Agrega tu nombre, tu teléfono y un correo electrónico válido.'],
  ['Please describe your vehicle so we can find you.', 'Describe tu vehículo para que podamos encontrarte.'],
  ['Sorry, we do not deliver to that ZIP code.', 'Lo sentimos, no entregamos en ese código postal.'],
  ['That promo code is not valid.', 'Ese código no es válido.'],
  ['That code is not valid.', 'Ese código no es válido.'],
  ['Your order is below the delivery minimum.', 'Tu pedido no alcanza el mínimo para entrega.'],
  ['Your order is empty.', 'Tu pedido está vacío.'],
  ['Online ordering is paused right now. Please call us to order.', 'Los pedidos en línea están en pausa. Llámanos para ordenar.'],
  ['That gift card has nothing left on it.', 'Esa tarjeta de regalo no tiene saldo.'],
  ['That time is no longer available. Please choose another.', 'Esa hora ya no está disponible. Elige otra.'],
  ['That time just filled up. Please choose another.', 'Esa hora se acaba de llenar. Elige otra.'],
  ['We are closed right now. Please choose a time for your order.', 'Estamos cerrados en este momento. Elige una hora para tu pedido.'],
  ['We are closed right now. Please order during our opening hours.', 'Estamos cerrados en este momento. Haz tu pedido durante nuestro horario.'],
  ['We have as many orders as we can make right now. Please choose a later time.', 'Tenemos todos los pedidos que podemos preparar ahora. Elige una hora más tarde.'],
  ['We have as many orders as we can make right now. Please try again in a few minutes.', 'Tenemos todos los pedidos que podemos preparar ahora. Inténtalo de nuevo en unos minutos.'],
  ['Too many attempts. Please wait a few minutes and try again.', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
  ['Online booking is not available right now. Please call us.', 'Las reservas en línea no están disponibles en este momento. Llámanos.'],
  ['Choose what you would like to book.', 'Elige lo que quieres reservar.'],
  ['Choose a date.', 'Elige una fecha.'],
  ['Choose a time.', 'Elige una hora.'],
  ['Please add your name.', 'Agrega tu nombre.'],
  ['That email address does not look right.', 'Ese correo electrónico no parece correcto.'],
  ['Please add your phone number and a valid email address.', 'Agrega tu teléfono y un correo electrónico válido.'],
  ['Please choose a time in the future.', 'Elige una hora en el futuro.'],
  ['Please choose a date in the next three months.', 'Elige una fecha dentro de los próximos tres meses.'],
  ['We are closed at that time. Please choose another.', 'Estamos cerrados a esa hora. Elige otra.'],
  ['That booking would run past closing time. Please choose an earlier time.', 'Esa reserva terminaría después del cierre. Elige una hora más temprana.'],
  ['That time is fully booked. Please choose another.', 'Esa hora está completa. Elige otra.'],
  ['Could not read that message.', 'No pudimos leer ese mensaje.'],
  ['Please add your name, a valid email and a message.', 'Agrega tu nombre, un correo electrónico válido y un mensaje.'],
  ['One of your items is no longer available. Please remove it and try again.', 'Uno de tus artículos ya no está disponible. Quítalo e inténtalo de nuevo.'],
  ['Could not read that request.', 'No pudimos leer esa solicitud.'],
  ['That is too large to upload.', 'Es demasiado grande para enviarlo.'],
  ['Something went wrong on our side. Please try again.', 'Algo salió mal de nuestro lado. Inténtalo de nuevo.'],
  ['This is a preview. Orders, bookings and messages can be sent once your site is published.', 'Esta es una vista previa. Los pedidos, las reservas y los mensajes se podrán enviar cuando el sitio esté publicado.'],
]);
const PATTERNS = [
  [/^(.+) is sold out right now\. Please remove it and try again\.$/, '$1 está agotado. Quítalo e inténtalo de nuevo.'],
  [/^(.+) is no longer available\. Please remove it and try again\.$/, '$1 ya no está disponible. Quítalo e inténtalo de nuevo.'],
  [/^Only (\d+) of (.+) left\. Please lower the quantity and try again\.$/, 'Solo quedan $1 de $2. Baja la cantidad e inténtalo de nuevo.'],
  [/^Prices just changed\. Your total is now (.+)\.$/, 'Los precios acaban de cambiar. Tu total ahora es $1.'],
];

export function inSpanish(message) {
  const m = String(message || '');
  if (EXACT.has(m)) return EXACT.get(m);
  for (const [re, to] of PATTERNS) if (re.test(m)) return m.replace(re, to);
  return m;
}
