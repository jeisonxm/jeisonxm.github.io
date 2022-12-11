<?php
  // Obtener los datos del formulario
  $nombre = $_POST['name-input'];
  $correo = $_POST['email-input'];
  $mensaje = $_POST['message-input'];

  // Construir el mensaje
  $cuerpo = "Nombre: $nombre\n";
  $cuerpo .= "Correo: $correo\n";
  $cuerpo .= "Mensaje: $mensaje\n";

  // Enviar el correo a mi dirección de correo electrónico
  $enviado = mail('jeisonwumitre@gmail.com', 'Mensaje desde mi sitio web', $cuerpo);

  // Mostrar un mensaje de éxito o error
  if ($enviado) {
    echo "¡Gracias por contactarnos! Te responderemos lo antes posible.";
  } else {
    echo "Se ha producido un error al enviar el mensaje. Por favor, inténtalo de nuevo más tarde.";
  }
?>