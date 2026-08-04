module.exports = async function (req, res) {
  return res.status(200).json({
    test: "Hello from Vercel",
    method: req.method
  });
};