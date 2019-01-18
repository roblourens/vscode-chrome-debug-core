/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

 import { Protocol as CDTP } from 'devtools-protocol';

export class CDTPSchema {
    constructor(protected api: CDTP.SchemaApi) { }

    public async getDomains(): Promise<CDTP.Schema.Domain[]> {
        return (await this.api.getDomains()).domains;
    }
}
