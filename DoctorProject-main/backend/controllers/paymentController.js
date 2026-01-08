// controllers/paymentController.js
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @desc    Create payment order
// @route   POST /api/payments/create-order
// @access  Private
const createPaymentOrder = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const userId = req.userId;

    // Validate appointment
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: userId,
      isActive: true
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if already paid
    if (appointment.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this appointment'
      });
    }

    // Create Razorpay order
    const options = {
      amount: appointment.consultationFee * 100, // Amount in paise
      currency: 'INR',
      receipt: `apt_${appointment._id}`,
      notes: {
        appointmentId: appointment._id.toString(),
        patientId: userId.toString(),
        doctorId: appointment.doctorId.toString(),
        appointmentDate: appointment.appointmentDate.toISOString()
      }
    };

    const order = await razorpay.orders.create(options);

    // Update appointment with order details
    appointment.paymentOrderId = order.id;
    await appointment.save();

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        appointmentId: appointment._id,
        key: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Verify payment signature
// @route   POST /api/payments/verify
// @access  Private
const verifyPayment = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      appointmentId 
    } = req.body;
    const userId = req.userId;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification details'
      });
    }

    // Get appointment
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: userId,
      isActive: true
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      // Payment verified successfully
      appointment.paymentStatus = 'paid';
      appointment.paymentId = razorpay_payment_id;
      appointment.paymentOrderId = razorpay_order_id;
      appointment.paymentMethod = 'online';
      appointment.paidAt = new Date();
      appointment.status = 'confirmed'; // Confirm appointment after payment
      await appointment.save();

      // Update doctor's total appointments count if not already counted
      await User.findByIdAndUpdate(appointment.doctorId, {
        $inc: { totalAppointments: 1 }
      });

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          appointmentId: appointment._id,
          paymentId: razorpay_payment_id,
          status: 'paid',
          appointmentStatus: 'confirmed'
        }
      });
    } else {
      // Payment verification failed
      appointment.paymentStatus = 'failed';
      await appointment.save();

      res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Handle payment failure
// @route   POST /api/payments/failure
// @access  Private
const handlePaymentFailure = async (req, res) => {
  try {
    const { appointmentId, error } = req.body;
    const userId = req.userId;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: userId,
      isActive: true
    });

    if (appointment) {
      appointment.paymentStatus = 'failed';
      appointment.paymentError = error?.description || 'Payment failed';
      await appointment.save();
    }

    res.json({
      success: true,
      message: 'Payment failure recorded'
    });

  } catch (error) {
    console.error('Handle payment failure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment failure'
    });
  }
};

// @desc    Get payment details
// @route   GET /api/payments/:appointmentId
// @access  Private
const getPaymentDetails = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.userId;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: userId,
      isActive: true
    }).select('paymentStatus paymentId paymentOrderId paymentMethod consultationFee paidAt paymentError');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      data: {
        paymentStatus: appointment.paymentStatus,
        paymentId: appointment.paymentId,
        paymentOrderId: appointment.paymentOrderId,
        paymentMethod: appointment.paymentMethod,
        amount: appointment.consultationFee,
        paidAt: appointment.paidAt,
        paymentError: appointment.paymentError
      }
    });

  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details'
    });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handlePaymentFailure,
  getPaymentDetails
};