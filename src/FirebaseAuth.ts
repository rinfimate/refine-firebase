import { FirebaseApp } from "@firebase/app";
import { AuthBindings } from "@refinedev/core";
import { Auth, browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, getIdTokenResult, ParsedToken, RecaptchaParameters, RecaptchaVerifier, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail, updatePassword, updateProfile, User as FirebaseUser } from "firebase/auth";
import { ILoginArgs, IRegisterArgs } from "./interfaces";

export class FirebaseAuth {
    auth: Auth;

    constructor (
        firebaseApp?: FirebaseApp,
        auth?: Auth
    ) {
        this.auth = auth || getAuth(firebaseApp);
        this.auth.useDeviceLanguage();

        this.getAuthProvider = this.getAuthProvider.bind(this);
        this.handleLogIn = this.handleLogIn.bind(this);
        this.handleRegister = this.handleRegister.bind(this);
        this.handleLogOut = this.handleLogOut.bind(this);
        this.handleResetPassword = this.handleResetPassword.bind(this);
        this.onError = this.onError.bind(this);
        this.onUpdateUserData = this.onUpdateUserData.bind(this);
        this.getUserIdentity = this.getUserIdentity.bind(this);
        this.handleCheckAuth = this.handleCheckAuth.bind(this);
        this.createRecaptcha = this.createRecaptcha.bind(this);
        this.getPermissions = this.getPermissions.bind(this);
    }

    public async handleLogIn({ email, password, remember }: ILoginArgs) {
        try {
            if (this.auth) {
                await this.auth.setPersistence(remember ? browserLocalPersistence : browserSessionPersistence);
                const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
                const userToken = await userCredential?.user?.getIdToken?.();
                if (userToken) {
                    return {
                        success: true,
                        redirectTo: "/",
                    };
                } else {
                    return {
                        success: false,
                        error: {
                            message: "Login Error",
                            name: "Invalid email or password",
                        }
                    };
                }
            } else {
                return {
                    success: false,
                    error: {
                        message: "Login Error",
                        name: "Missing email or password",
                    }
                };
            }
        } catch (error) {
            return {
                success: false,
                error: {
                    message: "Login Error",
                    name: error.message,
                }
            };
        }
    }

    public async handleLogOut() {
        await signOut(this.auth);
        return {
            success: true,
            redirectTo: "/login",
        };
    }

    public async handleRegister(args: IRegisterArgs) {
        try {
            const { email, password, displayName } = args;

            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            await sendEmailVerification(userCredential.user);
            if (userCredential.user) {
                if (displayName) {
                    await updateProfile(userCredential.user, { displayName });
                }
                return {
                    success: true,
                    redirectTo: "/",
                };
            }
        } catch (error) {
            return {
                success: false,
                error: {
                    name: "Register Error",
                    message: error.message,
                },
            };
        }
    }

    public async handleResetPassword(params: { email: string;}) {
        const { email } = params;
        if(email) {
            try {
                await sendPasswordResetEmail(this.auth, email);
                return {
                    success: true,
                    redirectTo: "/login",
            };
            } catch (error) {
                return {
                    success: false,
                        error: {
                            name: "Password Reset Error",
                            message: error.message,
                    },
                };
            }
        }
    }

    public async onUpdateUserData(args: IRegisterArgs) {

        try {
            if (this.auth?.currentUser) {
                const { displayName, email, password } = args;
                if (password) {
                    await updatePassword(this.auth.currentUser, password);
                }
                if (email && this.auth.currentUser.email !== email) {
                    await updateEmail(this.auth.currentUser, email);
                }
                if (displayName && this.auth.currentUser.displayName !== displayName) {
                    await updateProfile(this.auth.currentUser, { displayName: displayName });
                }
                if(password) {
                    return {
                        success: true,
                        redirectTo: "/login",
                    };
                }
                else {
                    return {
                        success: true,
                        redirectTo: "/",
                    };
                }
            }
        } catch (error) {
            return {
                success: false,
                error: {
                    name: "Update User Data",
                    message: error.message,
                },
            };
        }
    }

    private getFirebaseUser(): Promise<FirebaseUser> {
        return new Promise<FirebaseUser>((resolve, reject) => {
            const unsubscribe = this.auth?.onAuthStateChanged(user => {
                unsubscribe();
                resolve(user as FirebaseUser | PromiseLike<FirebaseUser>);
            }, reject);
        });
    }

    private async handleCheckAuth() {
        if (await this.getFirebaseUser()) {
            return {
                authenticated: true,
            };
        } else {
            return {
                authenticated: false,
                redirectTo: "/login",
                logout: true,
                error: {
                    message: "Check failed",
                    name: "User not found",
                }
            };
        }
    }

    private async onError(error: any) {
        return {
            redirectTo: "/login",
            logout: true,
            error: error,
        };
    }

    public async getPermissions(): Promise<ParsedToken> {
        if (this.auth?.currentUser) {
            const idTokenResult = await getIdTokenResult(this.auth.currentUser);
            return idTokenResult?.claims;
        } else {
            return null;
        }
    }

    private async getUserIdentity() {
        const user = this.auth?.currentUser;
        if(user) {
            return {
                ...this.auth.currentUser,
                id: user?.email || "",
                name: user?.displayName || "",
                avatar: user?.photoURL || ""
            };
        } else {
            return null;
        }
        
    }

    public createRecaptcha(containerOrId: string | HTMLDivElement, parameters?: RecaptchaParameters) {
        return new RecaptchaVerifier(containerOrId, parameters, this.auth);
    }

    public getAuthProvider(): AuthBindings {
        return {
            login: this.handleLogIn,
            logout: this.handleLogOut,
            forgotPassword: this.handleResetPassword,
            check: this.handleCheckAuth,
            onError: this.onError,
            getPermissions: this.getPermissions,
            getIdentity: this.getUserIdentity,
        };
    }
}
