import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.log('[API] Unauthorized - redirecting to login');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH ====================

export const authAPI = {
  // Login
  login: async (municipalityId, password) => {
    const response = await api.post('/api/auth/login', {
      municipality_id: municipalityId,
      password
    });
    return response.data;
  },

  // Logout
  logout: async () => {
    const response = await api.post('/api/auth/logout');
    return response.data;
  },

  // Get current user
  me: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  // Change password
  changePassword: async (oldPassword, newPassword) => {
    const response = await api.post('/api/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword
    });
    return response.data;
  }
};

// ==================== MUNICIPALITIES ====================

export const municipalitiesAPI = {
  // Get all municipalities (for login dropdown)
  getAll: async () => {
    const response = await api.get('/api/municipalities/all');
    return response.data;
  },

  // Get municipalities accessible to current user
  getMy: async () => {
    const response = await api.get('/api/my/municipalities');
    return response.data;
  }
};

// ==================== INDICATORS (Form 1-GMU) ====================

export const indicatorsAPI = {
  // Get indicators by form code
  getByFormCode: async (formCode) => {
    const response = await api.get(`/api/indicators/${formCode}`);
    return response.data;
  },

  // Get indicator values
  getValues: async (municipalityId, year, month) => {
    const response = await api.get('/api/indicator-values', {
      params: { municipality_id: municipalityId, year, month }
    });
    return response.data;
  },

  // Save indicator values
  saveValues: async (municipalityId, year, month, values) => {
    const response = await api.post('/api/reports/save', {
      municipality_id: municipalityId,
      period_year: year,
      period_month: month,
      values
    });
    return response.data;
  },

  // Export report
  exportReport: async (municipalityId, year, month) => {
    const response = await api.post('/api/reports/export', {
      municipality_id: municipalityId,
      period_year: year,
      period_month: month
    }, {
      responseType: 'blob'
    });
    return response.data;
  }
};

// ==================== SERVICES ====================

export const servicesAPI = {
  // Get services catalog
  getCatalog: async (category = null) => {
    const response = await api.get('/api/services-catalog', {
      params: category ? { category } : {}
    });
    return response.data;
  },

  // Get service categories
  getCategories: async () => {
    const response = await api.get('/api/service-categories');
    return response.data;
  },

  // Get service values
  getValues: async (year, month, municipalityId) => {
    const response = await api.get('/api/service-values', {
      params: { year, month, municipality_id: municipalityId }
    });
    return response.data;
  },

  // Save service values
  saveValues: async (municipalityId, year, month, values) => {
    const response = await api.post('/api/service-values/save', {
      municipality_id: municipalityId,
      period_year: year,
      period_month: month,
      values
    });
    return response.data;
  },

  // Get monthly data for a service
  getMonthly: async (serviceId, year) => {
    const response = await api.get(`/api/services/${serviceId}/monthly`, {
      params: { year }
    });
    return response.data;
  },

  // Get details for a service
  getDetails: async (serviceId, year) => {
    const response = await api.get(`/api/services/${serviceId}/details`, {
      params: { year }
    });
    return response.data;
  }
};

// ==================== GIBDD ====================

export const gibddAPI = {
  // Get GIBDD data
  getData: async (municipalityId, year, month) => {
    const response = await api.get('/api/gibdd/data', {
      params: { municipality_id: municipalityId, year, month }
    });
    return response.data;
  },

  // Save GIBDD data
  saveData: async (municipalityId, year, month, data) => {
    const response = await api.post('/api/gibdd/save', {
      municipality_id: municipalityId,
      period_year: year,
      period_month: month,
      ...data
    });
    return response.data;
  },

  // Get aggregated statistics
  getStats: async (year) => {
    const response = await api.get('/api/gibdd/stats', {
      params: { year }
    });
    return response.data;
  }
};

// ==================== DASHBOARD ====================

export const dashboardAPI = {
  // Get dashboard data
  getData: async (year) => {
    const response = await api.get('/api/dashboard/data', {
      params: { year }
    });
    return response.data;
  },

  // Get recent updates
  getRecentUpdates: async (year, municipalityId = null, serviceId = null, limit = 50) => {
    const response = await api.get('/api/dashboard/recent-updates', {
      params: { year, municipality_id: municipalityId, service_id: serviceId, limit }
    });
    return response.data;
  }
};

// ==================== ADMIN ====================

export const adminAPI = {
  // Get all users
  getUsers: async () => {
    const response = await api.get('/api/admin/users');
    return response.data;
  },

  // Create user
  createUser: async (userData) => {
    const response = await api.post('/api/admin/users', userData);
    return response.data;
  },

  // Update user
  updateUser: async (userId, userData) => {
    const response = await api.put(`/api/admin/users/${userId}`, userData);
    return response.data;
  },

  // Delete user
  deleteUser: async (userId) => {
    const response = await api.delete(`/api/admin/users/${userId}`);
    return response.data;
  },

  // Reset password
  resetPassword: async (userId, newPassword) => {
    const response = await api.post(`/api/admin/users/${userId}/reset-password`, {
      new_password: newPassword
    });
    return response.data;
  }
};

// ==================== STATS ====================

export const statsAPI = {
  // Get general statistics
  getStats: async () => {
    const response = await api.get('/api/stats');
    return response.data;
  }
};

export default api;
