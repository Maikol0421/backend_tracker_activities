const express = require('express');
const postgres = require('postgres');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString);

// Middleware para manejo de errores de base de datos
const handleDBError = (error, res) => {
  console.error("Error de base de datos:", error);
  res.status(500).json({ 
    error: "Error interno del servidor" 
  });
};

// 1. GET /api/tracker_activities/subjects/list
// Obtener lista de materias
app.get("/api/tracker_activities/subjects/list", async (req, res) => {
  try {
    const subjects = await sql`
      SELECT id, subject 
      FROM subjects 
      ORDER BY subject ASC
    `;

    res.status(200).json({
      message: "Materias obtenidas exitosamente",
      data: subjects
    });

  } catch (error) {
    handleDBError(error, res);
  }
});

// 2. GET /api/tracker_activities/students/list
// Obtener lista de estudiantes
app.get("/api/tracker_activities/students/list", async (req, res) => {
  try {
    const students = await sql`
      SELECT num_list, name 
      FROM students 
      ORDER BY num_list ASC
    `;

    res.status(200).json({
      message: "Estudiantes obtenidos exitosamente",
      data: students
    });

  } catch (error) {
    handleDBError(error, res);
  }
});

// 3. POST /api/tracker_activities/activities/create
// Crear nueva actividad
app.post("/api/tracker_activities/activities/create", async (req, res) => {
  const { id, name, date, description } = req.body;

  // Validaciones de campos obligatorios
  if (!id || !name || !date) {
    return res.status(400).json({
      error: "Los campos id (materia), name y date son obligatorios"
    });
  }

  // Validar que id sea un número
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "El campo id debe ser un número entero positivo"
    });
  }

  // Validar formato de fecha (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({
      error: "El campo date debe tener el formato YYYY-MM-DD"
    });
  }

  // Validar que la fecha sea válida
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      error: "La fecha proporcionada no es válida"
    });
  }

  try {
    // Verificar que la materia existe
    const subjectExists = await sql`
      SELECT id FROM subjects WHERE id = ${id}
    `;

    if (subjectExists.length === 0) {
      return res.status(400).json({
        error: "La materia especificada no existe"
      });
    }

    // Insertar la actividad
    const result = await sql`
      INSERT INTO activities (name, date, id_subject, description)
      VALUES (${name.trim()}, ${date}, ${id}, ${description ? description.trim() : null})
      RETURNING id
    `;

    res.status(201).json({
      message: "Actividad creada exitosamente",
      id: result[0].id
    });

  } catch (error) {
    if (error.code === '23503') { // Foreign key violation
      res.status(400).json({
        error: "La materia especificada no existe"
      });
    } else {
      handleDBError(error, res);
    }
  }
});

// 4. POST /api/tracker_activities/qualifications/create
// Crear nueva calificación
app.post("/api/tracker_activities/qualifications/create", async (req, res) => {
  const { id_subject, num_list, qualification, id_activity } = req.body;

  // Validaciones de campos obligatorios
  if (!id_subject || !num_list || qualification === undefined || !id_activity) {
    return res.status(400).json({
      error: "Los campos id_subject, num_list, qualification y id_activity son obligatorios"
    });
  }

  // Validar que sean números
  if (!Number.isInteger(id_subject) || id_subject <= 0) {
    return res.status(400).json({
      error: "El campo id_subject debe ser un número entero positivo"
    });
  }

  if (!Number.isInteger(num_list) || num_list <= 0) {
    return res.status(400).json({
      error: "El campo num_list debe ser un número entero positivo"
    });
  }

  if (!Number.isInteger(qualification) || qualification < 0 || qualification > 100) {
    return res.status(400).json({
      error: "El campo qualification debe ser un número entero entre 0 y 100"
    });
  }

  if (!Number.isInteger(id_activity) || id_activity <= 0) {
    return res.status(400).json({
      error: "El campo id_activity debe ser un número entero positivo"
    });
  }

  try {
    // Verificar que el estudiante existe
    const studentExists = await sql`
      SELECT id FROM students WHERE num_list = ${num_list}
    `;

    if (studentExists.length === 0) {
      return res.status(400).json({
        error: "El estudiante especificado no existe"
      });
    }

    // Verificar que la actividad existe y pertenece a la materia especificada
    const activityExists = await sql`
      SELECT id FROM activities 
      WHERE id = ${id_activity} AND id_subject = ${id_subject}
    `;

    if (activityExists.length === 0) {
      return res.status(400).json({
        error: "La actividad especificada no existe o no pertenece a la materia indicada"
      });
    }

    // Verificar si ya existe una calificación para este estudiante en esta actividad
    const existingQualification = await sql`
      SELECT id FROM qualifications 
      WHERE num_list_student = ${num_list} AND id_activity = ${id_activity}
    `;

    if (existingQualification.length > 0) {
      return res.status(400).json({
        error: "Ya existe una calificación para este estudiante en esta actividad"
      });
    }

    // Insertar la calificación
    const result = await sql`
      INSERT INTO qualifications (qualification, num_list_student, id_activity)
      VALUES (${qualification}, ${num_list}, ${id_activity})
      RETURNING id
    `;

    res.status(201).json({
      message: "Calificación creada exitosamente",
      id: result[0].id
    });

  } catch (error) {
    if (error.code === '23503') { // Foreign key violation
      res.status(400).json({
        error: "La actividad especificada no existe"
      });
    } else if (error.code === '23505') { // Unique violation
      res.status(400).json({
        error: "Ya existe una calificación para este estudiante en esta actividad"
      });
    } else {
      handleDBError(error, res);
    }
  }
});

// Endpoint de salud para verificar que el servidor está funcionando
app.get("/api/health", (req, res) => {
  res.status(200).json({
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// Middleware para rutas no encontradas
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada"
  });
});

// Middleware global para manejo de errores
app.use((error, req, res, next) => {
  console.error("Error no manejado:", error);
  res.status(500).json({
    error: "Error interno del servidor"
  });
});
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
module.exports = app;