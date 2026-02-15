const express = require('express');
const axios = require('axios');
const app = express();

// Definimos el puerto
const PORT = 3000;

// Nuestra primera "ventana" de datos
app.get('/f1/posicion/:driverNum', async (req, res) => {
    try {
        const { driverNum } = req.params; // Capturamos el número del piloto de la URL
        
        // Consultamos la API de OpenF1 por la posición más reciente
        const url = `https://api.openf1.org/v1/position?driver_number=${driverNum}`;
        const response = await axios.get(url);
        
        // OpenF1 devuelve un array. Tomamos el último elemento (el más actual).
        const data = response.data;
        const lastPosition = data[data.length - 1];

        // Construimos el JSON "Arquitectónico": Mínimo peso, máxima info.
        const responseForESP32 = {
            n: driverNum,               // Número
            p: lastPosition.position,    // Posición
            t: new Date().toISOString()  // Timestamp para saber si está fresco
        };

        console.log(`Dintel Studio - Enviando datos de piloto ${driverNum}`);
        res.json(responseForESP32);

    } catch (error) {
        res.status(500).json({ error: "Error en la obra (Backend)" });
    }
});

app.listen(PORT, () => {
    console.log(`Dintel Studio Backend corriendo en http://localhost:${PORT}`);
});