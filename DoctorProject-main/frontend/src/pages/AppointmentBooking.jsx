import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import backendUrl from '../utils/BackendURL';
import '../styles/AppointmentBooking.css';

const AppointmentBooking = () => {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  
  // State management
  const [doctor, setDoctor] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [availability, setAvailability] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [appointmentId, setAppointmentId] = useState(null);

  // Helper function to check if URL is a Cloudinary URL
  const isCloudinaryUrl = (url) => {
    return url && (url.startsWith('https://res.cloudinary.com') || url.startsWith('http://res.cloudinary.com'));
  };

  // Helper function to get correct image URL
  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    if (isCloudinaryUrl(imageUrl)) {
      return imageUrl;
    }
    return `${backendUrl}${imageUrl}`;
  };

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get maximum date (90 days from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    return maxDate.toISOString().split('T')[0];
  };

  // Load Razorpay script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchDoctorProfile();
  }, [doctorId]);

  useEffect(() => {
    if (selectedDate && doctorId) {
      fetchDoctorAvailability();
    }
  }, [selectedDate, doctorId]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please login to book appointments');
        return;
      }

      const response = await fetch(`${backendUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      } else {
        setError('Please login to book appointments');
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
      setError('Please login to book appointments');
    }
  };

  const fetchDoctorProfile = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/doctors/${doctorId}`);
      const data = await response.json();

      if (response.ok) {
        setDoctor(data.doctor);
      } else {
        setError(data.message || 'Doctor not found');
      }
    } catch (error) {
      setError('Failed to load doctor information');
      console.error('Doctor profile fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctorAvailability = async () => {
    setAvailabilityLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${backendUrl}/api/appointments/doctors/${doctorId}/availability?date=${selectedDate}`
      );
      const data = await response.json();

      if (response.ok) {
        setAvailability(data.data.availability || []);
      } else {
        setError(data.message || 'Failed to fetch availability');
        setAvailability([]);
      }
    } catch (error) {
      setError('Failed to fetch doctor availability');
      setAvailability([]);
      console.error('Availability fetch error:', error);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!currentUser) {
      setError('Please login to book appointments');
      return;
    }

    if (!selectedLocation) {
      setError('Please select a location and time slot');
      return;
    }

    setBookingLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Step 1: Create appointment
      const response = await fetch(`${backendUrl}/api/appointments/doctors/${doctorId}/book`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appointmentDate: selectedDate,
          practiceLocationId: selectedLocation.locationId,
          symptoms: symptoms.trim(),
          notes: notes.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setAppointmentId(data.data.appointmentId);
        
        // Step 2: Initiate payment
        await initiatePayment(data.data.appointmentId);
      } else {
        setError(data.message || 'Failed to book appointment');
      }
    } catch (error) {
      setError('Network error. Please try again.');
      console.error('Booking error:', error);
    } finally {
      setBookingLoading(false);
    }
  };

  const initiatePayment = async (appointmentId) => {
    setPaymentLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError('Failed to load payment gateway. Please try again.');
        return;
      }

      // Create payment order
      const orderResponse = await fetch(`${backendUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ appointmentId })
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        setError(orderData.message || 'Failed to create payment order');
        return;
      }

      // Configure Razorpay options
      const options = {
        key: orderData.data.key,
        amount: orderData.data.amount,
        currency: orderData.data.currency,
        name: 'MediCare',
        description: `Consultation with Dr. ${doctor.name}`,
        order_id: orderData.data.orderId,
        handler: async function (response) {
          await verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            appointmentId: appointmentId
          });
        },
        prefill: {
          name: currentUser.name,
          email: currentUser.email,
          contact: currentUser.phone || ''
        },
        theme: {
          color: '#3399cc'
        },
        modal: {
          ondismiss: function() {
            setPaymentLoading(false);
            setError('Payment cancelled. Your appointment is on hold.');
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (error) {
      setError('Payment initiation failed. Please try again.');
      console.error('Payment error:', error);
    } finally {
      setPaymentLoading(false);
    }
  };

  const verifyPayment = async (paymentData) => {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`${backendUrl}/api/payments/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage('Payment successful! Your appointment is confirmed.');
        setTimeout(() => {
          navigate('/appointments');
        }, 2000);
      } else {
        setError(data.message || 'Payment verification failed');
      }
    } catch (error) {
      setError('Payment verification failed. Please contact support.');
      console.error('Verification error:', error);
    }
  };

  const formatSpecialization = (specialization) => {
    if (!specialization) return 'General Physician';
    
    const specializations = {
      'cardiology': 'Cardiologist',
      'dermatology': 'Dermatologist', 
      'neurology': 'Neurologist',
      'pediatrics': 'Pediatrician',
      'orthopedics': 'Orthopedic Surgeon',
      'psychiatry': 'Psychiatrist',
      'general': 'General Physician',
      'other': 'Specialist'
    };
    return specializations[specialization] || specialization;
  };

  if (loading) {
    return (
      <div className="appointment-page-container">
        <div className="appointment-loading-spinner">
          <i className="fas fa-spinner fa-spin"></i>
          <span>Loading doctor information...</span>
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="appointment-page-container">
        <div className="appointment-error-message">
          <div className="error-content">Doctor not found</div>
          <button 
            onClick={() => navigate('/doctors')}
            className="back-to-doctors-btn"
          >
            Back to Doctors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="appointment-page-container">
      {/* Header */}
      <div className="appointment-header">
        <div className="appointment-header-content">
          <div className="header-navigation">
            <button 
              onClick={() => navigate(`/doctor/${doctorId}`)}
              className="back-button"
            >
              <i className="fas fa-arrow-left"></i>
            </button>
            <div className="header-text">
              <h1>Book Appointment</h1>
              <p>Schedule an appointment with Dr. {doctor.name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Doctor Info Card */}
      <div className="doctor-info-card">
        <div className="doctor-info-content">
          <div className="doctor-avatar">
            {doctor.profileImage ? (
              <img 
                src={getImageUrl(doctor.profileImage)} 
                alt={doctor.name}
                className="doctor-avatar-img"
              />
            ) : (
              <div className="doctor-avatar-placeholder">
                <i className="fas fa-user-md"></i>
              </div>
            )}
          </div>
          <div className="doctor-details">
            <h2>Dr. {doctor.name}</h2>
            <p className="doctor-specialization">{formatSpecialization(doctor.specialization)}</p>
            <div className="doctor-stats">
              <span className="stat-item">
                <i className="fas fa-star"></i> {doctor.ratings?.average || 0}/5
              </span>
              <span className="stat-item">
                <i className="fas fa-calendar-check"></i> {doctor.experience || 0} years experience
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Form */}
      <div className="booking-form-card">
        <h3>Select Date & Time</h3>

        {/* Error/Success Messages */}
        {error && (
          <div className="message-alert error-alert">
            <i className="fas fa-exclamation-triangle"></i>
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="message-alert success-alert">
            <i className="fas fa-check-circle"></i>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Date Selection */}
        <div className="form-group">
          <label className="form-label">Select Date</label>
          <input
            type="date"
            value={selectedDate}
            min={getMinDate()}
            max={getMaxDate()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="form-input date-input"
          />
        </div>

        {/* Available Slots */}
        {selectedDate && (
          <div className="available-slots-section">
            <label className="form-label">Available Time Slots</label>
            
            {availabilityLoading ? (
              <div className="availability-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Checking availability...</p>
              </div>
            ) : availability.length > 0 ? (
              <div className="slots-list">
                {availability.map((slot, index) => (
                  <div
                    key={index}
                    className={`slot-card ${
                      selectedLocation?.locationId === slot.locationId ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedLocation(slot)}
                  >
                    <div className="slot-info">
                      <h4>{slot.locationName}</h4>
                      <p className="location-address">
                        <i className="fas fa-map-marker-alt"></i>
                        {slot.address?.city && `${slot.address.city}, ${slot.address.state}`}
                      </p>
                      <p className="time-slot">
                        <i className="fas fa-clock"></i>
                        {slot.timeSlot.startTime} - {slot.timeSlot.endTime}
                      </p>
                    </div>
                    <div className="slot-details">
                      <div className="fee">₹{slot.consultationFee}</div>
                      <div className="queue-info">Queue: #{slot.nextQueueNumber}</div>
                      <div className="availability-info">{slot.availableSpots} slots available</div>
                      <div className="wait-time">Est. wait: {slot.estimatedWaitTime}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-slots-message">
                <i className="fas fa-calendar-times"></i>
                <p>No available slots for the selected date. Please choose another date.</p>
              </div>
            )}
          </div>
        )}

        {/* Symptoms & Notes */}
        {selectedLocation && (
          <div className="additional-info-section">
            <div className="form-group">
              <label className="form-label">Describe your symptoms (optional)</label>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Brief description of your health concerns..."
                rows={3}
                maxLength={500}
                className="form-textarea"
              />
              <p className="char-count">{symptoms.length}/500 characters</p>
            </div>

            <div className="form-group">
              <label className="form-label">Additional notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information or special requests..."
                rows={2}
                maxLength={1000}
                className="form-textarea"
              />
              <p className="char-count">{notes.length}/1000 characters</p>
            </div>
          </div>
        )}

        {/* Booking Summary & Action */}
        {selectedLocation && (
          <div className="booking-summary-section">
            <div className="booking-summary">
              <h4>Booking Summary</h4>
              <div className="summary-details">
                <div className="summary-row">
                  <span>Date:</span>
                  <span>{new Date(selectedDate).toLocaleDateString()}</span>
                </div>
                <div className="summary-row">
                  <span>Location:</span>
                  <span>{selectedLocation.locationName}</span>
                </div>
                <div className="summary-row">
                  <span>Time:</span>
                  <span>{selectedLocation.timeSlot.startTime} - {selectedLocation.timeSlot.endTime}</span>
                </div>
                <div className="summary-row">
                  <span>Queue Number:</span>
                  <span>#{selectedLocation.nextQueueNumber}</span>
                </div>
                <div className="summary-row total-fee">
                  <span>Consultation Fee:</span>
                  <span>₹{selectedLocation.consultationFee}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleBookAppointment}
              disabled={bookingLoading || paymentLoading || !currentUser}
              className="confirm-booking-btn"
            >
              {bookingLoading || paymentLoading ? (
                <span className="btn-loading">
                  <i className="fas fa-spinner fa-spin"></i>
                  {bookingLoading ? 'Creating Appointment...' : 'Processing Payment...'}
                </span>
              ) : !currentUser ? (
                'Please Login to Book'
              ) : (
                <>
                  <i className="fas fa-lock"></i> Proceed to Payment
                </>
              )}
            </button>

            {!currentUser && (
              <p className="login-prompt">
                <button 
                  onClick={() => navigate('/login')}
                  className="link-button"
                >
                  Login
                </button> or <button 
                  onClick={() => navigate('/register')}
                  className="link-button"
                >
                  Register
                </button> to book appointments
              </p>
            )}

            <div className="payment-security-note">
              <i className="fas fa-shield-alt"></i>
              <p>Secure payment powered by Razorpay. Your payment information is encrypted and secure.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentBooking;