import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { sendMail } from "../utils/sendMail.js";

const register = asynchandler(async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    if(!email || !password){ //first validates whether both email and password are provided
        throw new ApiError(400, "Email and password are required")
    }
    const existed = await User.findOne({email});
    if(existed){ //rejects duplicate registration
        throw new ApiError(400, "User already exists")
    }
    const otp = Math.floor(Math.random() * 1000000); //generate a 6-digit OTP 
    const user = await User.create({email, password,otp}); //calls this in user.model.js 
    try {
        console.log("sending email")  //now email is tried to be sent and if it cant then rollback happens
        await sendMail(user.email,`User Verification`,`<h1>Otp: ${otp}</h1>`);
    } catch (error) {
        await User.findByIdAndDelete(user._id); //compensating rollback in case email couldn't be sent
        throw new ApiError(500,error.message);
    }
    return res.json(
        new ApiResponse(200,{},"Otp sent check your email"));

});
const verifyUser = asynchandler(async (req, res) => {
    const{email,otp} = req.body;
    if(!email || !otp){
        throw new ApiError(400, "Email and otp are required")
    }
    const user = await User.findOne({email});
    if(!user){
        throw new ApiError(400, "User not found")
    }
    const isMatch = await user.checkOtp(otp); //compares the submitted plain-text OTP with the stored bcrypt hash
    if(!isMatch){
        throw new ApiError(400, "Invalid otp")
    }
    user.isVerified = true;
    user.otp = '';
    const accessToken = await user.generateAccessToken(); //signs id,email and isTracking
    const refreshToken = await user.generateRefreshToken(); //signs id and saves it on user.refreshToken in the DB
    user.refreshToken = refreshToken;
    await user.save(); //we need both tokens because access token keeps latency low and is short lived since it cant be revoked
    const options = { //the refresh token is long lived and stored in the database so if access token is leaked, the server can invalidate it
        httpOnly: true,
        secure: true
    }
    return res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options).json(new ApiResponse(200,{accessToken,refreshToken},"Verified successfully"));

});
const login = asynchandler(async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    if(!email || !password){
        throw new ApiError(400, "Email and password are required")
    }
    const user = await User.findOne({email}); 
    if(!user){
        throw new ApiError(400, "User not found")
    }
    if(user.isVerified === false){
        throw new ApiError(400, "User not verified")
    }
    const isMatch = await user.checkPassword(password);
    if(!isMatch){
        throw new ApiError(400, "Invalid password")
    }
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();
    user.refreshToken = refreshToken; //here the refresh token is saved in DB
    await user.save();//HTTP is stateless so cookies are used to persist authentication between requests.
    const options = {
        httpOnly: true, //this prevents client-side JS from reading the cookie to prevent attacks
        secure: true //makes sure that the cookie is transmitted only over encrypted HTTPS connections
    }
    return res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options).json(new ApiResponse(200,{accessToken,refreshToken},"User logged in successfully"));
})

const logout = asynchandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if(!user){
        throw new ApiError(400, "User not found")
    }
    user.refreshToken = ""; //invalidating the user's refresh token in the database
    await user.save();
    const options = { //clearing http only cookies
        httpOnly: true,
        secure: true
    }
    return res.status(200).cookie("accessToken",null,options).cookie("refreshToken",null,options).json(new ApiResponse(200,{},"User logged out successfully"));
}); //setting cookies to null instructs the browser to purge them immediately

export {register, verifyUser, login, logout}