// routes/appointmentRoutes.js - Complete and clean
const express = require('express');
const auth = require('../middleware/auth');
const {
  getDoctorAvailability,
  bookAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  getAppointmentById,
  cancelAppointment,
  updateAppointmentStatus
} = require('../controllers/appointmentController');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
// Get doctor availability (no auth required)
router.get('/doctors/:doctorId/availability', getDoctorAvailability);

// ==================== PROTECTED ROUTES (Patient) ====================
// Book appointment - creates appointment with pending-payment status
router.post('/doctors/:doctorId/book', auth, bookAppointment);

// Get patient's appointments
router.get('/patient/appointments', auth, getPatientAppointments);

// ==================== PROTECTED ROUTES (Doctor) ====================
// Get doctor's appointments
router.get('/doctor/appointments', auth, getDoctorAppointments);

// Update appointment status (doctors only)
router.put('/:appointmentId/status', auth, updateAppointmentStatus);

// ==================== PROTECTED ROUTES (Both) ====================
// Get specific appointment by ID
router.get('/:appointmentId', auth, getAppointmentById);

// Cancel appointment
router.put('/:appointmentId/cancel', auth, cancelAppointment);

module.exports = router;