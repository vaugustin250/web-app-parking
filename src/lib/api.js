import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to inject the JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Add a response interceptor for global error handling
api.interceptors.response.use((response) => response, async (error) => {
  const originalRequest = error.config;
  if (error.response && error.response.status === 401 && !originalRequest.url.includes('/login') && !originalRequest.url.includes('/refresh')) {
    if (!originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        
        // Use a clean axios instance to avoid circular interceptor loops
        const { data } = await axios.post(`${api.defaults.baseURL}/api/auth/refresh`, { refreshToken });
        
        localStorage.setItem('token', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        // Update the original request header with new token
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (err) {
        // If refresh fails, log the user out
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }
  }
  return Promise.reject(error);
});

export default api;
