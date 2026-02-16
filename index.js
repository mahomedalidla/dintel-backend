const express = require('express');
const axios = require('axios');
const app = express();

// Definimos el puerto
const PORT = 3000;

// Nuestra primera "ventana" de datos
app.get('/f1/dashboard/:driverNum', async (req, res) => {
    const { driverNum } = req.params;
    const now = new Date();

    try {
        // Traemos todas las sesiones del año para tener el calendario completo
        const response = await axios.get('https://api.openf1.org/v1/sessions');
        const sessions = response.data;

        // 1. Encontrar la sesión actual o la más reciente que terminó
        const lastSession = sessions.filter(s => new Date(s.date_end) < now).pop();
        // 2. Encontrar la próxima sesión
        const nextSession = sessions.find(s => new Date(s.date_start) > now);

        const daysSinceLast = lastSession ? (now - new Date(lastSession.date_end)) / (1000 * 60 * 60 * 24) : 999;

        // --- LÓGICA DE DECISIÓN ARQUITECTÓNICA ---

        // CASO A: CARRERA EN VIVO (o sesión activa)
        const activeSession = sessions.find(s => now >= new Date(s.date_start) && now <= new Date(s.date_end));
        
        if (activeSession) {
            // Aquí va el Promise.all que ya hicimos para telemetría
            const posRes = await axios.get(`https://api.openf1.org/v1/position?driver_number=${driverNum}&session_key=latest`);
            const pos = posRes.data.slice(-1)[0]?.position || "P?";
            
            return res.json({
                mode: "LIVE",
                gp: activeSession.location,
                val: pos,
                msg: activeSession.session_name.toUpperCase()
            });
        }

        // CASO B: POST-CARRERA (Dentro de los 3 días posteriores)
        if (daysSinceLast <= 3) {
            // Buscamos la última posición registrada en esa sesión
            const lastPosRes = await axios.get(`https://api.openf1.org/v1/position?driver_number=${driverNum}&session_key=${lastSession.session_key}`);
            const finalPos = lastPosRes.data.slice(-1)[0]?.position || "DNF";

            return res.json({
                mode: "POST",
                gp: lastSession.location,
                val: `P${finalPos}`,
                msg: "RESULTADO FINAL"
            });
        }

        // CASO C: PRÓXIMA CARRERA (Modo Anticipación)
        if (nextSession) {
            const fecha = new Date(nextSession.date_start).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
            return res.json({
                mode: "NEXT",
                gp: nextSession.location,
                val: fecha.toUpperCase(),
                msg: "SIGUIENTE GP"
            });
        }

        res.json({ mode: "IDLE", gp: "F1 SEASON", val: "---", msg: "NO DATA" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mode: "ERROR", val: "!!" });
    }
});