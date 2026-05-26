export const success = (res, data = null, statusCode = 200) => {
  return res.status(statusCode).json({ data });
};

export const created = (res, data = null) => {
  return res.status(201).json({ data });
};

export const paginatedSuccess = (res, data, total, limit, offset) => {
  return res.status(200).json({
    data,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      pages: Math.ceil(total / limit),
    },
  });
};

export const notFound = (res, message = 'Resource not found') => {
  return res.status(404).json({ error: message });
};

export const badRequest = (res, message = 'Bad request') => {
  return res.status(400).json({ error: message });
};