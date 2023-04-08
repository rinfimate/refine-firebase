import { Auth, ConfirmationResult } from "firebase/auth";

declare interface ILoginArgs {
    email: string;
    password: string;
    remember: boolean;
    recaptchaContainer: string;
    tenant?: string;
}

declare interface IPhoneOTPRequestArgs {
    phone: string;
    recaptchaContainer: string;
}

declare interface IPhoneOTPLoginArgs {
    otpRequestResult: ConfirmationResult;
    otp: string;
    remember: boolean;
}

declare interface IRegisterProps {
    setReCaptchaContainer: (ref: any) => void;
}

declare interface IRegisterArgs extends ILoginArgs {
    phone?: string;
    displayName?: string;
}

declare type TLogoutData = void | false | string;


export { ILoginArgs, IPhoneOTPRequestArgs, IPhoneOTPLoginArgs, IRegisterProps, IRegisterArgs, TLogoutData };