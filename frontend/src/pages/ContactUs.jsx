/**
 * =========================================================================
 * ContactUs.jsx — Contact / Support Form Page
 * =========================================================================
 *
 * PURPOSE:
 *   Provides a two-column layout with contact information on the left
 *   and a message form on the right.  Authenticated users have their
 *   name and email pre-filled.  Messages are submitted to the Flask
 *   backend for storage.
 *
 * FEATURE / PAGE:
 *   Contact Us — accessible from the sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - POST /api/contact — Sends name, email, subject, message, and
 *     optional user_id to the Flask API.
 *   - supabase.auth.getUser() — Pre-fills name/email for logged-in users.
 *
 * RELATED COMPONENTS:
 *   - AI Coach page (linked from the "Live Chat" info card).
 *   - App.jsx router — Mounts at '/contact-us'.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Mail, MessageSquare, Send, CheckCircle2 } from 'lucide-react';

// ======================= COMPONENT =======================
/**
 * ContactUs — contact form with info sidebar.
 * @returns {JSX.Element}
 */
const ContactUs = () => {

  // ======================= STATE & HOOKS =======================

  // Form fields: name, email, subject, message
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  // Whether the submit request is in progress
  const [loading, setLoading] = useState(false);
  // Status banner: { type: 'success'|'error', text: '...' }
  const [status, setStatus] = useState({ type: '', text: '' });
  // Authenticated user's ID (null if not logged in)
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    document.title = "Contact Us | Mutaafi";
    // Pre-fill user data if logged in
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setFormData(prev => ({
          ...prev,
          email: user.email || '',
          name: user.user_metadata?.first_name 
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim() 
            : ''
        }));
      }
    };
    fetchUser();
  }, []);

  // ======================= EVENT HANDLERS =======================

  /**
   * Generic change handler for all text inputs.
   * @param {React.ChangeEvent} e
   */
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ======================= HELPER FUNCTIONS =======================

  /**
   * Validates an email address using a standard regex pattern.
   * @param {string} email — The email string to validate.
   * @returns {boolean} True if the email is valid.
   */
  const validateEmail = (email) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  /**
   * Validates the form, then POSTs the contact message to the backend.
   * Resets subject/message on success; keeps name/email pre-filled.
   *
   * @param {React.FormEvent} e — The form submit event.
   * @returns {Promise<void>}
   * Triggered when the "Send Message" button is clicked.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    // Validation
    if (!formData.name.trim()) {
      setStatus({ type: 'error', text: 'Please enter your full name.' });
      return;
    }
    if (!validateEmail(formData.email)) {
      setStatus({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    if (!formData.subject.trim()) {
      setStatus({ type: 'error', text: 'Please enter a subject.' });
      return;
    }
    if (!formData.message.trim()) {
      setStatus({ type: 'error', text: 'Please enter a message.' });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send message');
      }

      setStatus({ type: 'success', text: 'Your message has been sent successfully! Our support team will get back to you soon.' });
      
      // Reset only subject and message; keep name and email pre-filled
      setFormData(prev => ({
        ...prev,
        subject: '',
        message: ''
      }));

    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'An error occurred while sending your message.' });
    } finally {
      setLoading(false);
    }
  };

  // ======================= RETURN (JSX) =======================
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 h-full flex flex-col">
      <div className="mb-8 pl-2">
        <h1 className="text-3xl font-bold text-[#2a3441] dark:text-gray-100 flex items-center">
          Contact Us
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm max-w-2xl">
          We'd love to hear from you. Whether you have a question about your plan, need technical support, or just want to share your fitness journey!
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        
        {/* Left Side: Contact Information */}
        <div className="lg:w-1/3 bg-[#108a6e] rounded-2xl p-8 text-white shadow-md flex flex-col justify-between relative overflow-hidden">
          {/* Decorative background circle */}
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-2xl"></div>
          
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-6">Get in touch</h2>
            <p className="text-[#eafff6] text-sm mb-10 leading-relaxed">
              Have a question or need help with your fitness journey? Reach out to us! Our support team is ready to assist you.
            </p>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="bg-[#0c6954] p-3 rounded-full">
                  <Mail size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-[#a2ecd1] uppercase tracking-wider font-semibold mb-1">Support Email</p>
                  <p className="font-medium">support@mutaafi.com</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-[#0c6954] p-3 rounded-full">
                  <MessageSquare size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-[#a2ecd1] uppercase tracking-wider font-semibold mb-1">Live Chat</p>
                  <p className="font-medium text-sm text-[#eafff6]">
                    Available at <Link to="/ai-coach" className="underline hover:text-white transition-colors">AI Coach Page</Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Contact Form */}
        <div className="lg:w-2/3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 flex flex-col">
          {status.text && (
            <div className={`p-4 mb-6 rounded-xl flex items-start space-x-3 ${status.type === 'success' ? 'bg-[#eafff6] dark:bg-[#108a6e]/20 text-[#108a6e] dark:text-[#19cba3] border border-[#a2ecd1] dark:border-[#108a6e]/30' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
              {status.type === 'success' && <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0" />}
              <p className="text-sm font-medium">{status.text}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 flex-1 flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-gray-700 dark:text-gray-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-gray-700 dark:text-gray-100 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="How can we help?"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-gray-700 dark:text-gray-100 transition-all"
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Write your message here..."
                className="w-full flex-1 min-h-[150px] px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-gray-700 dark:text-gray-100 resize-y transition-all"
              ></textarea>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className={`bg-[#108a6e] text-white px-8 py-3.5 rounded-xl font-semibold shadow-sm hover:bg-[#0c6954] hover:shadow transition-all focus:ring-2 focus:ring-offset-2 focus:ring-[#108a6e] flex items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={18} className="mr-2" />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default ContactUs;
