/**
 * Punto único de carga de TensorFlow.js. Solo el núcleo, las capas y el backend de CPU en JavaScript puro:
 * sin dependencias nativas (tfjs-node) ni WebGL, así funciona igual en Windows, en CI y dentro del worker.
 * Para una red de este tamaño (cientos de miles de parámetros) la CPU en JavaScript basta.
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import * as tfl from '@tensorflow/tfjs-layers';

// Sin PROD, tfjs imprime en cada proceso una recomendación de instalar tfjs-node.
tf.env().set('PROD', true);
await tf.setBackend('cpu');

export { tf, tfl };
