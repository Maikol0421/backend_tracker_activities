const express = require('express');
const postgres = require('postgres');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Conexión a la base de datos
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.bvplxcearejbjyhsdcnn:YOUR_PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
const sql = postgres(connectionString);

// Función para formatear fecha a dd/mm/yyyy
const formatDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

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

// 3. GET /api/tracker_activities/activities/create
// Crear nueva actividad usando query parameters
// Parámetros: ?id=1&name=Examen&date=2024-12-01&description=Descripción
app.get("/api/tracker_activities/activities/create", async (req, res) => {
  const { id, name, date, description } = req.query;

  // Validaciones de campos obligatorios
  if (!id || !name || !date) {
    return res.status(400).json({
      error: "Los parámetros id (materia), name y date son obligatorios"
    });
  }

  // Validar que id sea un número
  const subjectId = parseInt(id);
  if (isNaN(subjectId) || subjectId <= 0) {
    return res.status(400).json({
      error: "El parámetro id debe ser un número entero positivo"
    });
  }

  // Validar formato de fecha (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({
      error: "El parámetro date debe tener el formato YYYY-MM-DD"
    });
  }

  // Validar que la fecha sea válida
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      error: "La fecha proporcionada no es válida"
    });
  }

  // Validar longitud del nombre
  if (name.trim().length === 0) {
    return res.status(400).json({
      error: "El nombre de la actividad no puede estar vacío"
    });
  }

  try {
    // Verificar que la materia existe
    const subjectExists = await sql`
      SELECT id FROM subjects WHERE id = ${subjectId}
    `;

    if (subjectExists.length === 0) {
      return res.status(400).json({
        error: "La materia especificada no existe"
      });
    }

    // Insertar la actividad
    const result = await sql`
      INSERT INTO activities (name, date, id_subject, description)
      VALUES (${name.trim()}, ${date}, ${subjectId}, ${description ? description.trim() : null})
      RETURNING id, name, date, id_subject, description
    `;

    res.status(201).json({
      message: "Actividad creada exitosamente",
      id: result[0].id,
      data: {
        id: result[0].id,
        name: result[0].name,
        date: formatDate(result[0].date),
        id_subject: result[0].id_subject,
        description: result[0].description
      }
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

// 4. GET /api/tracker_activities/qualifications/create
// Crear nueva calificación usando query parameters
// Parámetros: ?id_subject=1&num_list=5&qualification=85&id_activity=2
app.get("/api/tracker_activities/qualifications/create", async (req, res) => {
  const { id_subject, num_list, qualification, id_activity } = req.query;

  // Validaciones de campos obligatorios
  if (!id_subject || !num_list || qualification === undefined || !id_activity) {
    return res.status(400).json({
      error: "Los parámetros id_subject, num_list, qualification y id_activity son obligatorios"
    });
  }

  // Convertir y validar números
  const subjectId = parseInt(id_subject);
  const studentNumList = parseInt(num_list);
  const qualificationValue = parseInt(qualification);
  const activityId = parseInt(id_activity);

  if (isNaN(subjectId) || subjectId <= 0) {
    return res.status(400).json({
      error: "El parámetro id_subject debe ser un número entero positivo"
    });
  }

  if (isNaN(studentNumList) || studentNumList <= 0) {
    return res.status(400).json({
      error: "El parámetro num_list debe ser un número entero positivo"
    });
  }

  if (isNaN(qualificationValue) || qualificationValue < 0 || qualificationValue > 100) {
    return res.status(400).json({
      error: "El parámetro qualification debe ser un número entero entre 0 y 100"
    });
  }

  if (isNaN(activityId) || activityId <= 0) {
    return res.status(400).json({
      error: "El parámetro id_activity debe ser un número entero positivo"
    });
  }

  try {
    // Verificar que el estudiante existe
    const studentExists = await sql`
      SELECT id FROM students WHERE num_list = ${studentNumList}
    `;

    if (studentExists.length === 0) {
      return res.status(400).json({
        error: "El estudiante especificado no existe"
      });
    }

    // Verificar que la actividad existe y pertenece a la materia especificada
    const activityExists = await sql`
      SELECT id FROM activities 
      WHERE id = ${activityId} AND id_subject = ${subjectId}
    `;

    if (activityExists.length === 0) {
      return res.status(400).json({
        error: "La actividad especificada no existe o no pertenece a la materia indicada"
      });
    }

    // Verificar si ya existe una calificación para este estudiante en esta actividad
    const existingQualification = await sql`
      SELECT id FROM qualifications 
      WHERE num_list_student = ${studentNumList} AND id_activity = ${activityId}
    `;

    if (existingQualification.length > 0) {
      return res.status(400).json({
        error: "Ya existe una calificación para este estudiante en esta actividad"
      });
    }

    // Insertar la calificación
    const result = await sql`
      INSERT INTO qualifications (qualification, num_list_student, id_activity)
      VALUES (${qualificationValue}, ${studentNumList}, ${activityId})
      RETURNING id
    `;

    res.status(201).json({
      message: "Calificación creada exitosamente",
      id: result[0].id,
      data: {
        id: result[0].id,
        qualification: qualificationValue,
        num_list_student: studentNumList,
        id_activity: activityId
      }
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

// Endpoint adicional: GET /api/tracker_activities/activities/list
// Obtener actividades por materia
// Parámetro: ?id_subject=1
app.get("/api/tracker_activities/activities/list", async (req, res) => {
  const { id_subject } = req.query;

  if (!id_subject) {
    return res.status(400).json({
      error: "El parámetro id_subject es obligatorio"
    });
  }

  const subjectId = parseInt(id_subject);
  if (isNaN(subjectId) || subjectId <= 0) {
    return res.status(400).json({
      error: "El parámetro id_subject debe ser un número entero positivo"
    });
  }

  try {
    const activities = await sql`
      SELECT a.id, a.name, a.date, a.description, s.subject as subject_name
      FROM activities a
      INNER JOIN subjects s ON a.id_subject = s.id
      WHERE a.id_subject = ${subjectId}
      ORDER BY a.date DESC, a.name ASC
    `;

    // Formatear las fechas en los resultados
    const formattedActivities = activities.map(activity => ({
      ...activity,
      date: formatDate(activity.date)
    }));

    res.status(200).json({
      message: "Actividades obtenidas exitosamente",
      data: formattedActivities
    });

  } catch (error) {
    handleDBError(error, res);
  }
});

// Endpoint adicional: GET /api/tracker_activities/qualifications/list
// Obtener calificaciones por actividad
// Parámetro: ?id_activity=1
app.get("/api/tracker_activities/qualifications/list", async (req, res) => {
  const { id_activity } = req.query;

  if (!id_activity) {
    return res.status(400).json({
      error: "El parámetro id_activity es obligatorio"
    });
  }

  const activityId = parseInt(id_activity);
  if (isNaN(activityId) || activityId <= 0) {
    return res.status(400).json({
      error: "El parámetro id_activity debe ser un número entero positivo"
    });
  }

  try {
    const qualifications = await sql`
      SELECT q.id, q.qualification, q.num_list_student, s.name as student_name, 
             a.name as activity_name, sub.subject as subject_name
      FROM qualifications q
      INNER JOIN students s ON q.num_list_student = s.num_list
      INNER JOIN activities a ON q.id_activity = a.id
      INNER JOIN subjects sub ON a.id_subject = sub.id
      WHERE q.id_activity = ${activityId}
      ORDER BY s.num_list ASC
    `;

    res.status(200).json({
      message: "Calificaciones obtenidas exitosamente",
      data: qualifications
    });

  } catch (error) {
    handleDBError(error, res);
  }
});

// Endpoint de salud para verificar que el servidor está funcionando
app.get("/api/health", (req, res) => {
  res.status(200).json({
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /api/tracker_activities/subjects/list",
      "GET /api/tracker_activities/students/list", 
      "GET /api/tracker_activities/activities/create?id=1&name=Examen&date=2024-12-01&description=Desc",
      "GET /api/tracker_activities/qualifications/create?id_subject=1&num_list=5&qualification=85&id_activity=2",
      "GET /api/tracker_activities/activities/list?id_subject=1",
      "GET /api/tracker_activities/qualifications/list?id_activity=1"
    ]
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

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor ejecutándose en puerto ${port}`);
  console.log(`Salud del servidor: http://localhost:${port}/api/health`);
});

module.exports = app;