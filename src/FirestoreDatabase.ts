import { Firestore, getDocs, getFirestore, collection, addDoc, doc, getDoc, updateDoc, deleteDoc, where, query, CollectionReference, DocumentData, Query, orderBy, serverTimestamp } from "firebase/firestore";
import { FirebaseStorage, getDownloadURL, uploadBytes, getStorage, deleteObject, listAll, ref as sRef } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { ICreateData, IDeleteData, IDeleteManyData, IGetList, IGetMany, IGetOne, IDatabaseOptions, IUpdateData, IUpdateManyData, CrudOperators } from "./interfaces";
import { BaseDatabase } from "./Database";
import { FirebaseFile } from "./interfaces";

export class FirestoreDatabase extends BaseDatabase {
    database: Firestore;
    storage: FirebaseStorage;

    constructor(
        options?: IDatabaseOptions,
        database?: Firestore,
        storage?: FirebaseStorage
    ) {
        super(options);
        this.database = database || getFirestore(options?.firebaseApp);
        this.storage = storage || getStorage(options?.firebaseApp);
        this.getCollectionRef = this.getCollectionRef.bind(this);
        this.getFilterQuery = this.getFilterQuery.bind(this);
        this.transform = this.transform.bind(this);
        this.uploadFiles = this.uploadFiles.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
        this.deleteFolder = this.deleteFolder.bind(this);
    }

    getCollectionRef(resource: string) {
        return collection(this.database, resource);
    }

    getDocRef(resource: string, id: string) {
        return doc(this.database, resource, id);
    }

    getFilterQuery({
        resource,
        sort,
        filters,
    }: IGetList): CollectionReference<DocumentData> | Query<DocumentData> {
        const ref = this.getCollectionRef(resource);
        let queryFilter = filters?.map((filter) => {
            const operator = getFilterOperator(filter.operator);
            return where(filter.field, operator, filter.value);
        });
        let querySorter = sort?.map((sorter) =>
            orderBy(sorter.field, sorter.order)
        );

        if (queryFilter?.length && querySorter?.length) {
            return query(ref, ...queryFilter, ...querySorter);
        } else if (queryFilter?.length) {
            return query(ref, ...queryFilter);
        } else if (querySorter?.length) {
            return query(ref, ...querySorter);
        } else {
            return ref;
        }
    }

    transform(variables: any, meta: any) {
        if (meta?.files) {
            const originalVariables = variables;
            const transformedVariables: any = {};
            for (var fieldName in originalVariables) {
                const fieldValues = originalVariables[fieldName];
                if (!meta?.files.includes(fieldName)) {
                    transformedVariables[fieldName] = fieldValues;
                }
            }
            return transformedVariables;
        } else {
            return variables;
        }
    }

    async uploadFiles(
        variables: any,
        resource: string,
        meta: any,
        docId: string,
        firebaseStorage: FirebaseStorage
    ) {
        const originalVariables = variables;
        const uploadFilesVariables: any = [];
        if (meta?.files) {
            for (var fieldName in originalVariables) {
                const fieldValue = originalVariables[fieldName];
                if (fieldValue) {
                    if (meta?.files.includes(fieldName)) {
                        uploadFilesVariables.push({
                            fileFieldName: fieldName,
                            filefieldValues: fieldValue,
                        });
                    }
                }
            }
        }
        const uploadFilesTransformedVariables: any = {};
        await Promise.all(
            uploadFilesVariables.map(async ({ fileFieldName, filefieldValues }) => {
                let uploadFilesTransformedVariablesList: any = [];
                for (let i = 0; i < filefieldValues.length; i++) {
                    const fieldFieldValue = filefieldValues[i];
                    if (fieldFieldValue.uploaded) {
                        uploadFilesTransformedVariablesList.push(fieldFieldValue);
                    } else {
                        const itemFirebaseFile = <FirebaseFile>fieldFieldValue;
                        const storageRef = sRef(firebaseStorage);
                        const fileName = `${resource}/${docId}/${fileFieldName}-${itemFirebaseFile.name}`;
                        const fileRef = sRef(storageRef, fileName);
                        const result = await uploadBytes(fileRef, itemFirebaseFile.file);
                        const downloadURL = await getDownloadURL(result.ref);
                        const transformedValueItem = {
                            url: downloadURL,
                            title: itemFirebaseFile?.title
                                ? itemFirebaseFile?.title
                                : itemFirebaseFile.name,
                            fileName: fileName,
                            uploadedAt: Date.now(),
                            uploaded: true,
                        };
                        uploadFilesTransformedVariablesList.push(transformedValueItem);
                    }
                }
                uploadFilesTransformedVariables[fileFieldName] =
                    uploadFilesTransformedVariablesList;
            })
        );
        return uploadFilesTransformedVariables;
    }

    async deleteFiles(filesToDelete: any, firebaseStorage: FirebaseStorage) {
        if (filesToDelete) {
            for (let i = 0; i < filesToDelete.length; i++) {
                let fileToDelete = filesToDelete[i];
                const storageRef = sRef(firebaseStorage);
                const fileRef = sRef(storageRef, fileToDelete);
                await deleteObject(fileRef);
            }
        }
    }

    async deleteFolder(
        resource: string,
        docId: string,
        firebaseStorage: FirebaseStorage
    ) {
        const folderName = `${resource}/${docId}`;
        const folderRef = sRef(firebaseStorage, folderName);
        const storageRefsToDelete = (await listAll(folderRef)).items;
        const filesToDelete = storageRefsToDelete.map((file) => file.fullPath);
        if (filesToDelete) {
            for (let i = 0; i < filesToDelete.length; i++) {
                let fileToDelete = filesToDelete[i];
                const storageRef = sRef(firebaseStorage);
                const fileRef = sRef(storageRef, fileToDelete);
                await deleteObject(fileRef);
            }
        }
    }

    async createData<TVariables = {}>(
        args: ICreateData<TVariables>
    ): Promise<any> {
        try {
            const ref = this.getCollectionRef(args.resource);
            const payload = this.requestPayloadFactory(
                args.resource,
                this.transform(args.variables, args.metaData)
            );
            payload['createdAt'] = Date.now();
            payload['updatedAt'] = Date.now();
            const auth = getAuth();
            const user = auth.currentUser;
            if (user) {
                payload['createdBy'] = user.uid;
                payload['updatedBy'] = user.uid;
            }
            const docRef = await addDoc(ref, payload);
            let data: any;
            if (args.metaData?.files) {
                // File upload handler
                const uploadFilesVariables = await this.uploadFiles(
                    args.variables,
                    args.resource,
                    args.metaData,
                    docRef.id,
                    this.storage
                );
                await updateDoc(docRef, uploadFilesVariables);
                data = {
                    id: docRef.id,
                    ...payload,
                    ...uploadFilesVariables,
                };
            } else {
                data = {
                    id: docRef.id,
                    ...payload,
                };
            }
            return { data };
        } catch (error) {
            Promise.reject(error);
        }
    }

    async createManyData<TVariables = {}>(
        args: ICreateData<TVariables>
    ): Promise<any> {
        try {
            var data = await this.createData(args);

            return { data };
        } catch (error) {
            Promise.reject(error);
        }
    }

    async deleteData(args: IDeleteData): Promise<any> {
        try {
            const ref = this.getDocRef(args.resource, args.id);
            await deleteDoc(ref);
            try {
                await this.deleteFolder(args.resource, args.id, this.storage);
            } catch (error) {
                //No op;
            }
        } catch (error) {
            Promise.reject(error);
        }
    }

    async deleteManyData(args: IDeleteManyData): Promise<any> {
        try {
            args.ids.forEach(async (id) => {
                this.deleteData({ resource: args.resource, id });
            });
        } catch (error) {
            Promise.reject(error);
        }
    }

    async getList(args: IGetList): Promise<any> {
        try {
            const ref = this.getFilterQuery(args);
            let data: any[] = [];
            const current = args.pagination?.current ?? 1;
            const limit = args.pagination?.pageSize || 10;

            const querySnapshot = await getDocs(ref);

            querySnapshot.forEach((document) => {
                data.push(
                    this.responsePayloadFactory(args.resource, {
                        id: document.id,
                        ...document.data(),
                    })
                );
            });
            return { data };
        } catch (error) {
            Promise.reject(error);
        }
    }

    async getMany(args: IGetMany): Promise<any> {
        try {
            const ref = this.getCollectionRef(args.resource);
            let data: any[] = [];

            const querySnapshot = await getDocs(ref);

            querySnapshot.forEach((document) => {
                if (args.ids.includes(document.id)) {
                    data.push(
                        this.responsePayloadFactory(args.resource, {
                            id: document.id,
                            ...document.data(),
                        })
                    );
                }
            });
            return { data };
        } catch (error) {
            Promise.reject(error);
        }
    }

    async getOne(args: IGetOne): Promise<any> {
        try {
            if (args.resource && args.id) {
                const docRef = this.getDocRef(args.resource, args.id);

                const docSnap = await getDoc(docRef);

                const data = this.responsePayloadFactory(args.resource, {
                    ...docSnap.data(),
                    id: docSnap.id,
                });

                return { data };
            }
        } catch (error: any) {
            Promise.reject(error);
        }
    }

    async updateData<TVariables = {}>(
        args: IUpdateData<TVariables>
    ): Promise<any> {
        try {
            let data: any = { data: args.variables };
            if (args.id && args.resource) {
                var docRef = this.getDocRef(args.resource, args.id);
                const payload = this.requestPayloadFactory(
                    args.resource,
                    this.transform(args.variables, args.metaData)
                )
                payload['updatedAt'] = Date.now();
                const auth = getAuth();
                const user = auth.currentUser;
                if (user) {
                    payload['updatedBy'] = user.uid;

                }
                await updateDoc(
                    docRef,
                    payload
                );
                let filesToDelete: string[] = [];
                if (args.metaData?.files) {
                    const fileFieldNames = args.metaData?.files;
                    // File upload handler
                    const newUploadedFilesVariables = await this.uploadFiles(
                        args.variables,
                        args.resource,
                        args.metaData,
                        docRef.id,
                        this.storage
                    );
                    const docSnap = await getDoc(docRef);
                    const docSnapData = docSnap.data();
                    for (let i = 0; i < fileFieldNames.length; i++) {
                        const fileFieldName = fileFieldNames[i];
                        filesToDelete = filesToDelete.concat(
                            docSnapData[fileFieldName]
                                .flatMap((fileFieldValues) => fileFieldValues)
                                .filter((fileFieldValue) => {
                                    const uploadedFiles =
                                        newUploadedFilesVariables[fileFieldName];
                                    let toDelete = true;
                                    for (let j = 0; j < uploadedFiles.length; j++) {
                                        let uploadedFile = uploadedFiles[j];
                                        if (
                                            uploadedFile.uploadedAt === fileFieldValue.uploadedAt &&
                                            uploadedFile.fileName === fileFieldValue.fileName
                                        ) {
                                            toDelete = false;
                                            break;
                                        }
                                    }
                                    return toDelete;
                                })
                                .map((fileFieldValue) => fileFieldValue.fileName)
                        );
                    }
                    await updateDoc(docRef, newUploadedFilesVariables);
                    data = {
                        ...newUploadedFilesVariables,
                    };
                }
                if (filesToDelete) {
                    await this.deleteFiles(filesToDelete, this.storage);
                }
            }
            return data;
        } catch (error) {
            Promise.reject(error);
        }
    }
    async updateManyData<TVariables = {}>(
        args: IUpdateManyData<TVariables>
    ): Promise<any> {
        try {
            args.ids.forEach(async (id) => {
                var ref = this.getDocRef(args.resource, id);
                await updateDoc(
                    ref,
                    this.requestPayloadFactory(args.resource, args.variables)
                );
            });
        } catch (error) {
            Promise.reject(error);
        }
    }
}

function getFilterOperator(operator: CrudOperators) {
    switch (operator) {
        case "lt":
            return "<";
        case "lte":
            return "<=";

        case "gt":
            return ">";
        case "gte":
            return ">=";

        case "eq":
            return "==";
        case "ne":
            return "!=";

        case "nin":
            return "not-in";

        case "in":
        default:
            return "in";
    }
}
