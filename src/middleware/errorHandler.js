// Middleware para atrapar errores de JSON mal formado
export const jsonErrorHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn('Malformed JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
};

export const errorHandler = (err, req, res, next) => {
  // PostgreSQL specific errors
  if (err.code === '23505') {
    console.warn('Duplicate key error:', err.message);
    return res.status(409).json({ error: 'Resource already exists' });
  }
  if (err.code === '23503') {
    console.warn('Foreign key constraint error:', err.message);
    return res.status(400).json({ error: 'Referenced resource not found' });
  }
  if (err.code === '23502') {
    console.warn('Not null constraint error:', err.message);
    return res.status(400).json({ error: 'Required field missing' });
  }

  // Authentication errors
  if (err.statusCode === 401 || err.message === 'Unauthorized') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validation errors
  if (err.statusCode === 400 || err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message || 'Validation failed' });
  }

  // Internal server error
  console.error('Internal server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { message: err.message }),
  });
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
  });
};